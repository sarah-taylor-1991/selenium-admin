const sessionDB = require('./database');

class DatabaseUtils {
    constructor() {
        this.db = sessionDB;
    }

    async getDatabaseStats() {
        try {
            const allSessions = await this.db.getAllSessions(null);
            const activeSessions = await this.db.getActiveSessions();

            const stats = {
                totalSessions: allSessions.length,
                activeSessions: activeSessions.length,
                completedSessions: allSessions.filter(s => s.status === 'completed').length,
                errorSessions: allSessions.filter(s => s.status === 'error').length,
                startingSessions: allSessions.filter(s => s.status === 'starting').length,
                runningSessions: allSessions.filter(s => s.status === 'running').length,
                sessionsWithQR: allSessions.filter(s => s.qrCodePath).length,
                sessionsWithScreenshots: allSessions.filter(s => s.screenshotPath).length,
                sessionsWithLocalStorage: allSessions.filter(s => s.localStoragePath).length,
                sessionsWithUserInfo: allSessions.filter(s => s.username).length
            };

            return stats;
        } catch (error) {
            console.error('❌ Error getting database stats:', error);
            throw error;
        }
    }

    async cleanupOldSessions(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            console.log(`🧹 Cleaning up sessions older than ${daysOld} days (before ${cutoffDate.toISOString()})`);

            // This would require adding a cleanup method to the database class
            // For now, we'll just show what would be cleaned up
            const allSessions = await this.db.getAllSessions(null);
            const oldSessions = allSessions.filter(s =>
                s.startTime && s.startTime < cutoffDate &&
                (s.status === 'completed' || s.status === 'error')
            );

            console.log(`📊 Found ${oldSessions.length} old sessions that could be cleaned up`);

            if (oldSessions.length > 0) {
                console.log('📋 Old sessions:');
                oldSessions.forEach(s => {
                    console.log(`  - ${s.id}: ${s.username || 'unknown'} (${s.status}) - ${s.startTime.toISOString()}`);
                });
            }

            return oldSessions.length;
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
            throw error;
        }
    }

    async exportSessions(format = 'json') {
        try {
            const sessions = await this.db.getAllSessions();

            if (format === 'json') {
                const exportData = {
                    exportDate: new Date().toISOString(),
                    totalSessions: sessions.length,
                    sessions: sessions.map(s => ({
                        id: s.id,
                        status: s.status,
                        startTime: s.startTime ? s.startTime.toISOString() : null,
                        endTime: s.endTime ? s.endTime.toISOString() : null,
                        username: s.username,
                        avatarSrc: s.avatarSrc,
                        parameters: s.parameters,
                        error: s.error,
                        qrCodePath: s.qrCodePath,
                        screenshotPath: s.screenshotPath,
                        localStoragePath: s.localStoragePath,
                        createdAt: s.createdAt,
                        updatedAt: s.updatedAt
                    }))
                };

                return exportData;
            } else {
                throw new Error(`Unsupported export format: ${format}`);
            }
        } catch (error) {
            console.error('❌ Error exporting sessions:', error);
            throw error;
        }
    }

    async searchSessions(query) {
        try {
            const allSessions = await this.db.getAllSessions(null);

            const results = allSessions.filter(s => {
                const searchStr = query.toLowerCase();
                return (
                    s.id.toLowerCase().includes(searchStr) ||
                    (s.username && s.username.toLowerCase().includes(searchStr)) ||
                    (s.status && s.status.toLowerCase().includes(searchStr)) ||
                    (s.error && s.error.toLowerCase().includes(searchStr))
                );
            });

            return results;
        } catch (error) {
            console.error('❌ Error searching sessions:', error);
            throw error;
        }
    }

    async printStats() {
        try {
            const stats = await this.getDatabaseStats();

            console.log('\n📊 Database Statistics');
            console.log('=====================');
            console.log(`Total Sessions: ${stats.totalSessions}`);
            console.log(`Active Sessions: ${stats.activeSessions}`);
            console.log(`Completed Sessions: ${stats.completedSessions}`);
            console.log(`Error Sessions: ${stats.errorSessions}`);
            console.log(`Starting Sessions: ${stats.startingSessions}`);
            console.log(`Running Sessions: ${stats.runningSessions}`);
            console.log(`Sessions with QR: ${stats.sessionsWithQR}`);
            console.log(`Sessions with Screenshots: ${stats.sessionsWithScreenshots}`);
            console.log(`Sessions with LocalStorage: ${stats.sessionsWithLocalStorage}`);
            console.log(`Sessions with User Info: ${stats.sessionsWithUserInfo}`);
            console.log('=====================\n');

            return stats;
        } catch (error) {
            console.error('❌ Error printing stats:', error);
            throw error;
        }
    }
}

// CLI interface
async function main() {
    const utils = new DatabaseUtils();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'stats':
                await utils.printStats();
                break;

            case 'cleanup':
                const days = parseInt(process.argv[3]) || 30;
                await utils.cleanupOldSessions(days);
                break;

            case 'export':
                const format = process.argv[3] || 'json';
                const exportData = await utils.exportSessions(format);
                console.log(JSON.stringify(exportData, null, 2));
                break;

            case 'search':
                const query = process.argv[3];
                if (!query) {
                    console.log('❌ Please provide a search query');
                    console.log('Usage: node db-utils.js search <query>');
                    process.exit(1);
                }
                const results = await utils.searchSessions(query);
                console.log(`🔍 Found ${results.length} sessions matching "${query}":`);
                results.forEach(s => {
                    console.log(`  - ${s.id}: ${s.username || 'unknown'} (${s.status})`);
                });
                break;

            default:
                console.log('📚 Database Utility Tool');
                console.log('======================');
                console.log('Available commands:');
                console.log('  stats                    - Show database statistics');
                console.log('  cleanup [days]          - Show old sessions (default: 30 days)');
                console.log('  export [format]         - Export sessions (default: json)');
                console.log('  search <query>          - Search sessions');
                console.log('');
                console.log('Examples:');
                console.log('  node db-utils.js stats');
                console.log('  node db-utils.js cleanup 7');
                console.log('  node db-utils.js export json');
                console.log('  node db-utils.js search "john"');
                break;
        }
    } catch (error) {
        console.error('💥 Command failed:', error.message);
        process.exit(1);
    }
}

// Run CLI if this script is executed directly
if (require.main === module) {
    main()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Fatal error:', error);
            process.exit(1);
        });
}

module.exports = DatabaseUtils;