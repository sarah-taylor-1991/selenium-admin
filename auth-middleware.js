const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
    PrismaClient
} = require('@prisma/client');

const prisma = new PrismaClient();

// JWT secret - in production, this should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token for user
 */
const generateToken = (userId, role) => {
    return jwt.sign({
            userId,
            role,
            iat: Math.floor(Date.now() / 1000)
        },
        JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN
        }
    );
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

/**
 * Hash password using bcrypt
 */
const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 */
const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

/**
 * Authentication middleware - verifies JWT token
 */
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(403).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        // Verify user still exists and is active
        const user = await prisma.user.findUnique({
            where: {
                id: decoded.userId
            },
            select: {
                id: true,
                username: true,
                role: true,
                isActive: true,
                isBanned: true,
                banReason: true,
                banDuration: true,
                banExpiresAt: true,
                bannedAt: true
            }
        });

        if (!user || !user.isActive) {
            return res.status(403).json({
                success: false,
                error: 'User not found or inactive'
            });
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
                return res.status(403).json({
                    success: false,
                    error: 'User is banned',
                    banInfo: {
                        reason: user.banReason,
                        duration: user.banDuration,
                        expiresAt: user.banExpiresAt,
                        bannedAt: user.bannedAt
                    }
                });
            }
        }

        // Add user info to request object
        req.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
};

/**
 * Authorization middleware - checks if user has required role
 */
const requireRole = (requiredRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const userRole = req.user.role;
        const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

        if (!roles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                error: `Access denied. Required role: ${roles.join(' or ')}`
            });
        }

        next();
    };
};

/**
 * Admin-only middleware
 */
const requireAdmin = requireRole('ADMIN');

/**
 * Member or Admin middleware
 */
const requireMember = requireRole(['MEMBER', 'ADMIN']);

/**
 * Create default admin user if none exists
 */
const createDefaultAdmin = async () => {
    try {
        const adminExists = await prisma.user.findFirst({
            where: {
                role: 'ADMIN'
            }
        });

        if (!adminExists) {
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
            const hashedPassword = await hashPassword(defaultPassword);

            const admin = await prisma.user.create({
                data: {
                    username: 'admin',
                    email: 'admin@example.com',
                    password: hashedPassword,
                    role: 'ADMIN',
                    isActive: true
                }
            });

            console.log('✅ Default admin user created:');
            console.log(`   Username: admin`);
            console.log(`   Password: ${defaultPassword}`);
            console.log(`   Email: admin@example.com`);
            console.log('⚠️  Please change the default password after first login!');
        }
    } catch (error) {
        console.error('❌ Error creating default admin user:', error);
    }
};

/**
 * Clean up expired sessions
 */
const cleanupExpiredSessions = async () => {
    try {
        const result = await prisma.userSession.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date()
                }
            }
        });

        if (result.count > 0) {
            console.log(`🧹 Cleaned up ${result.count} expired user sessions`);
        }
    } catch (error) {
        console.error('❌ Error cleaning up expired sessions:', error);
    }
};

module.exports = {
    generateToken,
    verifyToken,
    hashPassword,
    comparePassword,
    authenticateToken,
    requireRole,
    requireAdmin,
    requireMember,
    createDefaultAdmin,
    cleanupExpiredSessions
};