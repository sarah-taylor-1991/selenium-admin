const {
    PrismaClient
} = require('@prisma/client');
const crypto = require('crypto');
const {
    hashPassword,
    comparePassword,
    generateToken
} = require('./auth-middleware');

/**
 * Generates an 8-character URL-safe ID (e.g. "V1StGXR8")
 */
const generateShortId = () => crypto.randomBytes(6).toString('base64url');

const prisma = new PrismaClient();

/**
 * Create a new user
 */
const createUser = async (userData) => {
    try {
        const {
            username,
            email,
            password,
            role = 'MEMBER'
        } = userData;

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{
                        username
                    },
                    ...(email ? [{
                        email
                    }] : [])
                ]
            }
        });

        if (existingUser) {
            throw new Error('User with this username or email already exists');
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user
        const user = await prisma.user.create({
            data: {
                id: generateShortId(),
                username,
                email,
                password: hashedPassword,
                role,
                isActive: true
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true
            }
        });

        return user;
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
};

/**
 * Authenticate user login
 */
const authenticateUser = async (username, password) => {
    try {
        // Find user by username or email
        const user = await prisma.user.findFirst({
            where: {
                OR: [{
                        username
                    },
                    {
                        email: username
                    }
                ],
                isActive: true
            },
            select: {
                id: true,
                username: true,
                email: true,
                password: true,
                role: true,
                isBanned: true,
                banReason: true,
                banDuration: true,
                banExpiresAt: true,
                bannedAt: true
            }
        });

        if (!user) {
            throw new Error('Invalid credentials');
        }

        // Check if user is banned
        if (user.isBanned) {
            // Check if temporary ban has expired
            if (user.banExpiresAt && new Date() > user.banExpiresAt) {
                // Auto-unban expired temporary bans
                await prisma.user.update({
                    where: {
                        id: user.id
                    },
                    data: {
                        isBanned: false,
                        banReason: null,
                        banDuration: null,
                        banExpiresAt: null,
                        bannedAt: null,
                        bannedBy: null
                    }
                });
            } else {
                // User is still banned
                const banError = new Error('User is banned');
                banError.banInfo = {
                    reason: user.banReason,
                    duration: user.banDuration,
                    expiresAt: user.banExpiresAt,
                    bannedAt: user.bannedAt
                };
                throw banError;
            }
        }

        // Verify password
        const isValidPassword = await comparePassword(password, user.password);
        if (!isValidPassword) {
            throw new Error('Invalid credentials');
        }

        // Update last login time
        await prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                lastLoginAt: new Date()
            }
        });

        // Generate token
        const token = generateToken(user.id, user.role);

        // Store session in database
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

        await prisma.userSession.create({
            data: {
                userId: user.id,
                token,
                expiresAt
            }
        });

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            },
            token
        };
    } catch (error) {
        console.error('Error authenticating user:', error);
        throw error;
    }
};

/**
 * Get user by ID
 */
const getUserById = async (userId) => {
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                username: true,
                email: true,
                tg_username: true,
                role: true,
                rank: true,
                isActive: true,
                balance: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true
            }
        });

        return user;
    } catch (error) {
        console.error('Error getting user by ID:', error);
        throw error;
    }
};

/**
 * Get all users (admin only)
 */
const getAllUsers = async () => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                rank: true,
                balance: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return users;
    } catch (error) {
        console.error('Error getting all users:', error);
        throw error;
    }
};

/**
 * Update user
 */
const updateUser = async (userId, updateData) => {
    try {
        const {
            username,
            email,
            password,
            tg_username,
            role,
            isActive
        } = updateData;

        // Check if username or email already exists (excluding current user)
        if (username || email) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    AND: [{
                            id: {
                                not: userId
                            }
                        },
                        {
                            OR: [
                                ...(username ? [{
                                    username
                                }] : []),
                                ...(email ? [{
                                    email
                                }] : [])
                            ]
                        }
                    ]
                }
            });

            if (existingUser) {
                throw new Error('User with this username or email already exists');
            }
        }

        const user = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                ...(username && {
                    username
                }),
                ...(email !== undefined && {
                    email
                }),
                ...(tg_username !== undefined && {
                    tg_username
                }),
                ...(password && {
                    password
                }),
                ...(role && {
                    role
                }),
                ...(isActive !== undefined && {
                    isActive
                })
            },
            select: {
                id: true,
                username: true,
                email: true,
                tg_username: true,
                role: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true
            }
        });

        return user;
    } catch (error) {
        console.error('Error updating user:', error);
        throw error;
    }
};

/**
 * Change user password
 */
const changePassword = async (userId, currentPassword, newPassword) => {
    try {
        // Get user with password
        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Verify current password
        const isValidPassword = await comparePassword(currentPassword, user.password);
        if (!isValidPassword) {
            throw new Error('Current password is incorrect');
        }

        // Hash new password
        const hashedNewPassword = await hashPassword(newPassword);

        // Update password
        await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                password: hashedNewPassword
            }
        });

        return true;
    } catch (error) {
        console.error('Error changing password:', error);
        throw error;
    }
};

/**
 * Delete user
 */
const deleteUser = async (userId) => {
    try {
        await prisma.user.delete({
            where: {
                id: userId
            }
        });

        return true;
    } catch (error) {
        console.error('Error deleting user:', error);
        throw error;
    }
};

/**
 * Logout user (invalidate session)
 */
const logoutUser = async (token) => {
    try {
        await prisma.userSession.deleteMany({
            where: {
                token
            }
        });

        return true;
    } catch (error) {
        console.error('Error logging out user:', error);
        throw error;
    }
};

/**
 * Get user sessions
 */
const getUserSessions = async (userId) => {
    try {
        const sessions = await prisma.userSession.findMany({
            where: {
                userId
            },
            select: {
                id: true,
                token: true,
                expiresAt: true,
                createdAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return sessions;
    } catch (error) {
        console.error('Error getting user sessions:', error);
        throw error;
    }
};

/**
 * Ban a user
 */
const banUser = async (userId, banData, bannedByUserId) => {
    try {
        const {
            reason,
            duration
        } = banData;

        // Check if user exists and is not an admin
        const user = await prisma.user.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                username: true,
                role: true,
                isBanned: true
            }
        });

        if (!user) {
            throw new Error('User not found');
        }

        if (user.role === 'ADMIN') {
            throw new Error('Cannot ban admin users');
        }

        if (user.isBanned) {
            throw new Error('User is already banned');
        }

        // Calculate ban expiration date
        let banExpiresAt = null;
        if (duration !== 'permanent') {
            const now = new Date();
            switch (duration) {
                case '1day':
                    banExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    break;
                case '3days':
                    banExpiresAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
                    break;
                case '7days':
                    banExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    break;
                case '1month':
                    banExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    throw new Error('Invalid ban duration');
            }
        }

        // Update user with ban information
        const bannedUser = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                isBanned: true,
                banReason: reason,
                banDuration: duration,
                banExpiresAt,
                bannedAt: new Date(),
                bannedBy: bannedByUserId
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isBanned: true,
                banReason: true,
                banDuration: true,
                banExpiresAt: true,
                bannedAt: true,
                bannedBy: true
            }
        });

        // Log out all sessions for the banned user
        await prisma.userSession.deleteMany({
            where: {
                userId
            }
        });

        return bannedUser;
    } catch (error) {
        console.error('Error banning user:', error);
        throw error;
    }
};

/**
 * Unban a user
 */
const unbanUser = async (userId) => {
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                username: true,
                isBanned: true
            }
        });

        if (!user) {
            throw new Error('User not found');
        }

        if (!user.isBanned) {
            throw new Error('User is not banned');
        }

        const unbannedUser = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                isBanned: false,
                banReason: null,
                banDuration: null,
                banExpiresAt: null,
                bannedAt: null,
                bannedBy: null
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isBanned: true,
                banReason: true,
                banDuration: true,
                banExpiresAt: true,
                bannedAt: true,
                bannedBy: true
            }
        });

        return unbannedUser;
    } catch (error) {
        console.error('Error unbanning user:', error);
        throw error;
    }
};

/**
 * Check if user is banned and get ban information
 */
const checkUserBanStatus = async (userId) => {
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                username: true,
                isBanned: true,
                banReason: true,
                banDuration: true,
                banExpiresAt: true,
                bannedAt: true
            }
        });

        if (!user) {
            return {
                isBanned: false
            };
        }

        // Check if temporary ban has expired
        if (user.isBanned && user.banExpiresAt && new Date() > user.banExpiresAt) {
            // Auto-unban expired temporary bans
            await prisma.user.update({
                where: {
                    id: userId
                },
                data: {
                    isBanned: false,
                    banReason: null,
                    banDuration: null,
                    banExpiresAt: null,
                    bannedAt: null,
                    bannedBy: null
                }
            });
            return {
                isBanned: false
            };
        }

        return {
            isBanned: user.isBanned,
            banReason: user.banReason,
            banDuration: user.banDuration,
            banExpiresAt: user.banExpiresAt,
            bannedAt: user.bannedAt
        };
    } catch (error) {
        console.error('Error checking user ban status:', error);
        throw error;
    }
};

/**
 * Get all banned users
 */
const getBannedUsers = async () => {
    try {
        const bannedUsers = await prisma.user.findMany({
            where: {
                isBanned: true
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                banReason: true,
                banDuration: true,
                banExpiresAt: true,
                bannedAt: true,
                bannedBy: true
            },
            orderBy: {
                bannedAt: 'desc'
            }
        });

        return bannedUsers;
    } catch (error) {
        console.error('Error getting banned users:', error);
        throw error;
    }
};

/**
 * Update user balance
 */
const updateUserBalance = async (userId, newBalance) => {
    try {
        // Validate balance
        if (typeof newBalance !== 'number' || newBalance < 0) {
            throw new Error('Balance must be a non-negative number');
        }

        // Round to 2 decimal places for currency
        const roundedBalance = Math.round(newBalance * 100) / 100;

        const user = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                balance: roundedBalance
            },
            select: {
                id: true,
                username: true,
                email: true,
                balance: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true
            }
        });

        return {
            success: true,
            user
        };
    } catch (error) {
        console.error('Error updating user balance:', error);
        throw error;
    }
};

/**
 * Reset user balance to 0
 */
const resetUserBalance = async (userId) => {
    try {
        const user = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                balance: 0.0
            },
            select: {
                id: true,
                username: true,
                email: true,
                balance: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true
            }
        });

        return {
            success: true,
            user
        };
    } catch (error) {
        console.error('Error resetting user balance:', error);
        throw error;
    }
};

/**
 * Update user rank
 */
const updateUserRank = async (userId, newRank) => {
    try {
        // Validate rank
        const validRanks = ['ROOKIE', 'RUNNER', 'HUSTLER', 'THUG', 'ENFORCER', 'UNDERBOSS', 'OVERLORD', 'BOSS', 'GODFATHER', 'SHADOWMASTER'];
        if (!validRanks.includes(newRank)) {
            throw new Error('Invalid rank provided');
        }

        const user = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                rank: newRank
            },
            select: {
                id: true,
                username: true,
                email: true,
                rank: true,
                role: true,
                isActive: true,
                balance: true,
                createdAt: true,
                lastLoginAt: true
            }
        });

        return {
            success: true,
            user
        };
    } catch (error) {
        console.error('Error updating user rank:', error);
        throw error;
    }
};

module.exports = {
    createUser,
    authenticateUser,
    getUserById,
    getAllUsers,
    updateUser,
    changePassword,
    deleteUser,
    logoutUser,
    getUserSessions,
    banUser,
    unbanUser,
    checkUserBanStatus,
    getBannedUsers,
    updateUserBalance,
    resetUserBalance,
    updateUserRank,
    generateShortId
};