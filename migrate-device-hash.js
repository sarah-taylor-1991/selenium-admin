/**
 * Migration script to add deviceHash field to existing sessions
 * Run this after updating the Prisma schema
 */

const {
    PrismaClient
} = require('@prisma/client');
const path = require('path');

async function migrateDeviceHash() {
    const prisma = new PrismaClient();

    try {
        console.log('🚀 Starting deviceHash migration...');

        // Connect to database
        await prisma.$connect();
        console.log('✅ Connected to database');

        // Check if deviceHash column exists
        try {
            const result = await prisma.$queryRaw `
                SELECT sql FROM sqlite_master 
                WHERE type='table' AND name='sessions'
            `;
            console.log('📋 Current table schema:', result);

            // Check if device_hash column exists
            const columns = await prisma.$queryRaw `
                PRAGMA table_info(sessions)
            `;
            const hasDeviceHash = columns.some(col => col.name === 'device_hash');

            if (hasDeviceHash) {
                console.log('✅ device_hash column already exists');
            } else {
                console.log('➕ Adding device_hash column...');

                // Add device_hash column
                await prisma.$executeRaw `
                    ALTER TABLE sessions ADD COLUMN device_hash TEXT
                `;
                console.log('✅ device_hash column added successfully');
            }

        } catch (error) {
            console.error('❌ Error checking/adding device_hash column:', error);

            // Try alternative approach for SQLite
            try {
                console.log('🔄 Trying alternative SQLite approach...');

                // Create a new table with the updated schema
                await prisma.$executeRaw `
                    CREATE TABLE IF NOT EXISTS sessions_new (
                        id TEXT PRIMARY KEY,
                        socket_id TEXT,
                        device_hash TEXT,
                        status TEXT NOT NULL,
                        start_time DATETIME NOT NULL,
                        end_time DATETIME,
                        parameters TEXT,
                        error TEXT,
                        localStorage_code TEXT,
                        username TEXT,
                        avatar_src TEXT,
                        closed_by TEXT,
                        disconnected_by TEXT,
                        cleaned_up_by TEXT,
                        driver_closed BOOLEAN,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `;

                // Copy data from old table to new table
                await prisma.$executeRaw `
                    INSERT INTO sessions_new (id, socket_id, status, start_time, end_time, parameters, error, localStorage_code, username, avatar_src, closed_by, disconnected_by, cleaned_up_by, driver_closed, created_at, updated_at)
                    SELECT id, socket_id, status, start_time, end_time, parameters, error, localStorage_code, username, avatar_src, closed_by, disconnected_by, cleaned_up_by, driver_closed, created_at, updated_at
                    FROM sessions
                `;

                // Drop old table and rename new table
                await prisma.$executeRaw `DROP TABLE sessions`;
                await prisma.$executeRaw `ALTER TABLE sessions_new RENAME TO sessions`;

                console.log('✅ Table schema updated successfully');

            } catch (altError) {
                console.error('❌ Alternative approach also failed:', altError);
                throw altError;
            }
        }

        // Update existing sessions to have a default device hash
        const existingSessions = await prisma.session.findMany({
            where: {
                deviceHash: null
            }
        });

        if (existingSessions.length > 0) {
            console.log(`🔄 Updating ${existingSessions.length} existing sessions with default device hash...`);

            for (const session of existingSessions) {
                // Generate a unique device hash based on session ID and timestamp
                const defaultDeviceHash = `legacy_${session.id}_${session.startTime.getTime()}`;

                await prisma.session.update({
                    where: {
                        id: session.id
                    },
                    data: {
                        deviceHash: defaultDeviceHash
                    }
                });
            }

            console.log('✅ All existing sessions updated with default device hash');
        } else {
            console.log('✅ No existing sessions need updating');
        }

        console.log('🎉 DeviceHash migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
        console.log('🔌 Disconnected from database');
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    migrateDeviceHash()
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
    migrateDeviceHash
};