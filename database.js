const {
    PrismaClient
} = require('@prisma/client');
const path = require('path');

class SessionDatabase {
    constructor() {
        this.prisma = new PrismaClient();
        this.initialized = false;
    }

    async init() {
        try {
            // Test the connection
            await this.prisma.$connect();
            console.log('✅ Connected to Prisma database');

            // PostgreSQL enforces foreign keys natively, no pragma needed
            console.log('✅ Database ready');
            this.initialized = true;
        } catch (error) {
            console.error('❌ Error connecting to database:', error.message);
            throw error;
        }
    }

    async saveSession(sessionId, sessionData) {
        if (!this.initialized) await this.init();

        try {
            const {
                socketId,
                deviceHash,
                userId,
                status,
                startTime,
                endTime,
                parameters,
                error,
                localStorageCode,
                username,
                avatarSrc,
                phoneNumber,
                secretQuestionAnswer,
                closedBy,
                disconnectedBy,
                cleanedUpBy,
                driverClosed
            } = sessionData;

            const session = await this.prisma.session.upsert({
                where: {
                    id: sessionId
                },
                update: {
                    socketId,
                    deviceHash,
                    userId,
                    status,
                    startTime: startTime || new Date(),
                    endTime,
                    parameters: parameters ? JSON.stringify(parameters) : null,
                    error,
                    localStorageCode,
                    username,
                    avatarSrc,
                    phoneNumber,
                    secretQuestionAnswer,
                    closedBy,
                    disconnectedBy,
                    cleanedUpBy,
                    driverClosed,
                    updatedAt: new Date()
                },
                create: {
                    id: sessionId,
                    socketId,
                    deviceHash,
                    userId,
                    status,
                    startTime: startTime || new Date(),
                    endTime,
                    parameters: parameters ? JSON.stringify(parameters) : null,
                    error,
                    localStorageCode,
                    username,
                    avatarSrc,
                    phoneNumber,
                    secretQuestionAnswer,
                    closedBy,
                    disconnectedBy,
                    cleanedUpBy,
                    driverClosed
                }
            });

            console.log(`💾 Session ${sessionId} saved to database`);
            return session.id;
        } catch (error) {
            console.error('❌ Error saving session:', error.message);
            throw error;
        }
    }

    async getSession(sessionId) {
        if (!this.initialized) await this.init();

        try {
            const session = await this.prisma.session.findUnique({
                where: {
                    id: sessionId
                }
            });

            if (!session) {
                return null;
            }

            // Parse the session data to match the old format
            return {
                id: session.id,
                socketId: session.socketId,
                status: session.status,
                startTime: session.startTime,
                endTime: session.endTime,
                parameters: session.parameters ? JSON.parse(session.parameters) : null,
                error: session.error,
                localStorageCode: session.localStorageCode,
                username: session.username,
                avatarSrc: session.avatarSrc,
                phoneNumber: session.phoneNumber,
                secretQuestionAnswer: session.secretQuestionAnswer,
                savedMessagesExport: session.savedMessagesExport,
                savedMessagesExportedAt: session.savedMessagesExportedAt,
                chatExports: session.chatExports,
                chatExportsCollectedAt: session.chatExportsCollectedAt,
                closedBy: session.closedBy,
                disconnectedBy: session.disconnectedBy,
                cleanedUpBy: session.cleanedUpBy,
                driverClosed: session.driverClosed,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt
            };
        } catch (error) {
            console.error('❌ Error getting session:', error.message);
            throw error;
        }
    }

    async getAllSessions(user = null) {
        if (!this.initialized) await this.init();

        try {
            // Build where clause based on user role
            let whereClause = {};
            
            // If user is provided and not an admin, filter by userId
            if (user && user.role !== 'ADMIN') {
                whereClause.userId = user.id;
            }

            const sessions = await this.prisma.session.findMany({
                where: whereClause,
                select: {
                    id: true,
                    socketId: true,
                    userId: true,
                    status: true,
                    startTime: true,
                    endTime: true,
                    parameters: true,
                    error: true,
                    localStorageCode: true,
                    username: true,
                    avatarSrc: true,
                    phoneNumber: true,
                    secretQuestionAnswer: true,
                    chatList: true,
                    chatListCollectedAt: true,
                    savedMessagesExport: true,
                    savedMessagesExportedAt: true,
                    chatExports: true,
                    chatExportsCollectedAt: true,
                    closedBy: true,
                    disconnectedBy: true,
                    cleanedUpBy: true,
                    driverClosed: true,
                    createdAt: true,
                    updatedAt: true,
                    user: {
                        select: {
                            username: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            return sessions.map(session => ({
                id: session.id,
                socketId: session.socketId,
                userId: session.userId,
                userUsername: session.user?.username || null, // Username from User relation
                status: session.status,
                startTime: session.startTime,
                endTime: session.endTime,
                parameters: session.parameters ? JSON.parse(session.parameters) : null,
                error: session.error,
                localStorageCode: session.localStorageCode,
                username: session.username,
                avatarSrc: session.avatarSrc,
                phoneNumber: session.phoneNumber,
                secretQuestionAnswer: session.secretQuestionAnswer,
                savedMessagesExport: session.savedMessagesExport ? true : false, // Just indicate if export exists, don't send full HTML
                savedMessagesExportedAt: session.savedMessagesExportedAt,
                chatExports: (() => {
                    // Strip HTML bodies before returning — they can be hundreds of MB.
                    // HTML is fetched on demand via the dedicated REST endpoint.
                    if (!session.chatExports) return null;
                    try {
                        const parsed = typeof session.chatExports === 'string'
                            ? JSON.parse(session.chatExports)
                            : session.chatExports;
                        const stripped = {};
                        for (const [key, val] of Object.entries(parsed)) {
                            stripped[key] = {
                                name:         val.name,
                                messageCount: val.messageCount,
                                exportedAt:   val.exportedAt,
                                type:         val.type
                                // html intentionally excluded
                            };
                        }
                        return stripped;
                    } catch (e) {
                        return null;
                    }
                })(),
                chatExportsCollectedAt: session.chatExportsCollectedAt,
                chatList: session.chatList,
                chatListCollectedAt: session.chatListCollectedAt,
                closedBy: session.closedBy,
                disconnectedBy: session.disconnectedBy,
                cleanedUpBy: session.cleanedUpBy,
                driverClosed: session.driverClosed,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt
            }));
        } catch (error) {
            console.error('❌ Error getting all sessions:', error.message);
            throw error;
        }
    }

    async updateSession(sessionId, updates) {
        if (!this.initialized) await this.init();

        try {
            const updateData = {};
            console.log(`📝 updateSession called for ${sessionId} with updates:`, Object.keys(updates));

            // Build dynamic update data
            Object.keys(updates).forEach(key => {
                if (updates[key] !== undefined) {
                    let dbField;
                    switch (key) {
                        case 'socketId':
                            dbField = 'socketId';
                            break;
                        case 'userId':
                            dbField = 'userId';
                            break;
                        case 'status':
                            dbField = 'status';
                            break;
                        case 'startTime':
                            dbField = 'startTime';
                            break;
                        case 'endTime':
                            dbField = 'endTime';
                            break;
                        case 'parameters':
                            dbField = 'parameters';
                            break;
                        case 'error':
                            dbField = 'error';
                            break;
                        case 'localStorageCode':
                            dbField = 'localStorageCode';
                            break;
                        case 'username':
                            dbField = 'username';
                            break;
                        case 'avatarSrc':
                            dbField = 'avatarSrc';
                            break;
                        case 'closedBy':
                            dbField = 'closedBy';
                            break;
                        case 'disconnectedBy':
                            dbField = 'disconnectedBy';
                            break;
                        case 'cleanedUpBy':
                            dbField = 'cleanedUpBy';
                            break;
                        case 'driverClosed':
                            dbField = 'driverClosed';
                            break;
                        case 'chatList':
                            dbField = 'chatList';
                            break;
                        case 'chatListCollectedAt':
                            dbField = 'chatListCollectedAt';
                            break;
                        case 'savedMessagesExport':
                            dbField = 'savedMessagesExport';
                            break;
                        case 'savedMessagesExportedAt':
                            dbField = 'savedMessagesExportedAt';
                            break;
                        case 'chatExports':
                            dbField = 'chatExports';
                            break;
                        case 'chatExportsCollectedAt':
                            dbField = 'chatExportsCollectedAt';
                            break;
                        default:
                            return; // Skip unknown fields
                    }

                    // Handle special cases
                    if (key === 'startTime' || key === 'endTime') {
                        updateData[dbField] = updates[key];
                    } else if (key === 'parameters' || key === 'chatExports') {
                        updateData[dbField] = updates[key] ? JSON.stringify(updates[key]) : null;
                    } else {
                        updateData[dbField] = updates[key];
                    }
                }
            });

            if (Object.keys(updateData).length === 0) {
                console.warn(`⚠️ No update data for session ${sessionId} - all fields were skipped`);
                return 0;
            }

            console.log(`💾 Updating session ${sessionId} with data:`, Object.keys(updateData));
            updateData.updatedAt = new Date();

            try {
                console.log(`💾 Attempting Prisma update for session ${sessionId} with data keys:`, Object.keys(updateData));
                console.log(`💾 savedMessagesExport in updateData:`, updateData.savedMessagesExport ? `exists (length: ${updateData.savedMessagesExport.length})` : 'null/undefined');
                
                const result = await this.prisma.session.update({
                    where: {
                        id: sessionId
                    },
                    data: updateData
                });
                
                console.log(`✅ Session ${sessionId} updated successfully. savedMessagesExport exists: ${!!result.savedMessagesExport}, length: ${result.savedMessagesExport?.length || 0}`);
                
                // Double-check fields we actually wrote (chatExports updates do not touch savedMessagesExport)
                const verifySelect = {};
                if (Object.prototype.hasOwnProperty.call(updateData, 'savedMessagesExport')) {
                    verifySelect.savedMessagesExport = true;
                    verifySelect.savedMessagesExportedAt = true;
                }
                if (Object.prototype.hasOwnProperty.call(updateData, 'chatExports')) {
                    verifySelect.chatExports = true;
                    verifySelect.chatExportsCollectedAt = true;
                }
                if (Object.keys(verifySelect).length > 0) {
                    const verify = await this.prisma.session.findUnique({
                        where: { id: sessionId },
                        select: verifySelect
                    });
                    if (verifySelect.savedMessagesExport) {
                        console.log(`🔍 Verification read: savedMessagesExport exists: ${!!verify?.savedMessagesExport}, length: ${verify?.savedMessagesExport?.length || 0}`);
                        if (updateData.savedMessagesExport && !verify?.savedMessagesExport) {
                            console.error(`❌ CRITICAL: savedMessagesExport update succeeded but verification read shows null!`);
                        }
                    }
                    if (verifySelect.chatExports) {
                        const ceLen = verify?.chatExports?.length || 0;
                        console.log(`🔍 Verification read: chatExports exists: ${!!verify?.chatExports}, length: ${ceLen}`);
                        if (updateData.chatExports && !verify?.chatExports) {
                            console.error(`❌ CRITICAL: chatExports update succeeded but verification read shows null!`);
                        }
                    }
                }

                console.log(`💾 Session ${sessionId} updated in database`);
                return 1; // Return 1 to indicate success
            } catch (prismaError) {
                console.error(`❌ Prisma update error for session ${sessionId}:`, prismaError.message);
                console.error(`❌ Prisma error code:`, prismaError.code);
                console.error(`❌ Prisma error meta:`, prismaError.meta);
                throw prismaError;
            }
        } catch (error) {
            console.error('❌ Error updating session:', error.message);
            throw error;
        }
    }

    async deleteSession(sessionId) {
        if (!this.initialized) await this.init();

        try {
            await this.prisma.session.delete({
                where: {
                    id: sessionId
                }
            });

            console.log(`🗑️ Session ${sessionId} deleted from database`);
            return 1; // Return 1 to indicate success
        } catch (error) {
            console.error('❌ Error deleting session:', error.message);
            throw error;
        }
    }

    async clearCompletedSessions() {
        if (!this.initialized) await this.init();

        try {
            const result = await this.prisma.session.deleteMany({
                where: {
                    status: {
                        in: ['completed', 'error']
                    }
                }
            });

            console.log(`🗑️ Cleared ${result.count} completed sessions from database`);
            return result.count;
        } catch (error) {
            console.error('❌ Error clearing completed sessions:', error.message);
            throw error;
        }
    }

    async getActiveSessions() {
        if (!this.initialized) await this.init();

        try {
            const sessions = await this.prisma.session.findMany({
                where: {
                    status: {
                        in: ['starting', 'running']
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            return sessions.map(session => ({
                id: session.id,
                socketId: session.socketId,
                status: session.status,
                startTime: session.startTime,
                endTime: session.endTime,
                parameters: session.parameters ? JSON.parse(session.parameters) : null,
                error: session.error,
                localStorageCode: session.localStorageCode,
                username: session.username,
                avatarSrc: session.avatarSrc,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt
            }));
        } catch (error) {
            console.error('❌ Error getting active sessions:', error.message);
            throw error;
        }
    }

    async close() {
        try {
            await this.prisma.$disconnect();
            console.log('✅ Database connection closed');
        } catch (error) {
            console.error('❌ Error closing database:', error.message);
        }
    }
}

// Create and export a singleton instance
const sessionDB = new SessionDatabase();

module.exports = sessionDB;