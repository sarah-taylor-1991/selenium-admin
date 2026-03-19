const sqlite3 = require('sqlite3').verbose();
const {
    PrismaClient
} = require('@prisma/client');
const path = require('path');

async function migrateToPrisma() {
    console.log('🚀 Starting migration from SQLite to Prisma...');

    const oldDbPath = path.join(__dirname, 'storage', 'sessions.db');
    const prisma = new PrismaClient();

    try {
        // Connect to Prisma
        await prisma.$connect();
        console.log('✅ Connected to Prisma');

        // Check if old database exists
        const fs = require('fs');
        if (!fs.existsSync(oldDbPath)) {
            console.log('ℹ️ No existing SQLite database found, skipping migration');
            return;
        }

        // Connect to old SQLite database
        const oldDb = new sqlite3.Database(oldDbPath);

        // Get all sessions from old database
        const sessions = await new Promise((resolve, reject) => {
            oldDb.all('SELECT * FROM sessions', (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });

        console.log(`📊 Found ${sessions.length} sessions to migrate`);

        if (sessions.length === 0) {
            console.log('ℹ️ No sessions to migrate');
            return;
        }

        // Migrate each session
        let migratedCount = 0;
        let skippedCount = 0;

        for (const session of sessions) {
            try {
                // Check if session already exists in Prisma
                const existingSession = await prisma.session.findUnique({
                    where: {
                        id: session.id
                    }
                });

                if (existingSession) {
                    console.log(`⏭️ Session ${session.id} already exists, skipping`);
                    skippedCount++;
                    continue;
                }

                // Create new session in Prisma
                await prisma.session.create({
                    data: {
                        id: session.id,
                        socketId: session.socket_id,
                        status: session.status,
                        startTime: session.start_time ? new Date(session.start_time) : new Date(),
                        endTime: session.end_time ? new Date(session.end_time) : null,
                        parameters: session.parameters,
                        error: session.error,
                        localStorageCode: session.localStorage_code,
                        username: session.username,
                        avatarSrc: session.avatar_src,
                        createdAt: session.created_at ? new Date(session.created_at) : new Date(),
                        updatedAt: session.updated_at ? new Date(session.updated_at) : new Date()
                    }
                });

                console.log(`✅ Migrated session ${session.id}`);
                migratedCount++;

            } catch (error) {
                console.error(`❌ Error migrating session ${session.id}:`, error.message);
            }
        }

        // Close old database
        oldDb.close();

        console.log('\n🎉 Migration completed!');
        console.log(`📊 Total sessions: ${sessions.length}`);
        console.log(`✅ Migrated: ${migratedCount}`);
        console.log(`⏭️ Skipped: ${skippedCount}`);

        // Create backup of old database
        const backupPath = oldDbPath + '.backup.' + Date.now();
        fs.copyFileSync(oldDbPath, backupPath);
        console.log(`💾 Old database backed up to: ${backupPath}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateToPrisma()
        .then(() => {
            console.log('✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        });
}

module.exports = {
    migrateToPrisma
};