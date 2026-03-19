const fs = require('fs');
const path = require('path');
const sessionDB = require('./database');

async function migrateSessions() {
    console.log('🚀 Starting session migration from JSON to SQLite...');

    const sessionsFile = path.join(__dirname, 'storage', 'sessions.json');

    // Check if the old sessions file exists
    if (!fs.existsSync(sessionsFile)) {
        console.log('ℹ️ No existing sessions.json file found. Migration not needed.');
        return;
    }

    try {
        // Read existing sessions
        const fileContent = fs.readFileSync(sessionsFile, 'utf8');
        if (!fileContent.trim()) {
            console.log('ℹ️ Existing sessions.json file is empty. Migration not needed.');
            return;
        }

        const sessionsData = JSON.parse(fileContent);
        console.log(`📂 Found ${sessionsData.length} sessions to migrate`);

        let migratedCount = 0;
        let skippedCount = 0;

        for (const sessionData of sessionsData) {
            try {
                // Skip sessions that are currently running
                if (sessionData.status === 'starting' || sessionData.status === 'running') {
                    console.log(`⏭️ Skipping active session: ${sessionData.id} (status: ${sessionData.status})`);
                    skippedCount++;
                    continue;
                }

                // Prepare session data for database
                const dbSessionData = {
                    socketId: null, // No active socket for migrated sessions
                    status: sessionData.status,
                    startTime: new Date(sessionData.startTime),
                    endTime: sessionData.endTime ? new Date(sessionData.endTime) : null,
                    parameters: sessionData.parameters,
                    error: sessionData.error,
                    qrCodePath: sessionData.qrCodePath || null,
                    screenshotPath: sessionData.screenshotPath || null,
                    localStoragePath: sessionData.localStoragePath || null,
                    username: sessionData.username || null,
                    avatarSrc: sessionData.avatarSrc || null
                };

                // Save to database
                await sessionDB.saveSession(sessionData.id, dbSessionData);
                migratedCount++;

                console.log(`✅ Migrated session: ${sessionData.id} (${sessionData.username || 'unknown user'})`);

            } catch (error) {
                console.error(`❌ Error migrating session ${sessionData.id}:`, error.message);
            }
        }

        console.log(`\n🎉 Migration completed!`);
        console.log(`✅ Successfully migrated: ${migratedCount} sessions`);
        console.log(`⏭️ Skipped (active): ${skippedCount} sessions`);

        // Create backup of the old file
        const backupPath = path.join(__dirname, 'storage', 'sessions.json.backup');
        fs.copyFileSync(sessionsFile, backupPath);
        console.log(`💾 Created backup at: ${backupPath}`);

        // Optionally remove the old file (uncomment if you want to delete it)
        // fs.unlinkSync(sessionsFile);
        // console.log('🗑️ Removed old sessions.json file');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration if this script is executed directly
if (require.main === module) {
    migrateSessions()
        .then(() => {
            console.log('🏁 Migration script finished');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = {
    migrateSessions
};