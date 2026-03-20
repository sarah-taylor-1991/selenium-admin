/**
 * Migration: convert existing long cuid user IDs to short 8-char IDs.
 * Safe to run multiple times (idempotent) — skips users that already have short IDs.
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const generateShortId = () => crypto.randomBytes(6).toString('base64url');

// CUIDs start with 'c' and are 25 chars; UUIDs are 36 chars with dashes.
// Anything longer than 12 chars is considered a "long" legacy ID.
const isLongId = (id) => id.length > 12;

async function main() {
    const users = await prisma.user.findMany({ select: { id: true, username: true } });
    const toMigrate = users.filter(u => isLongId(u.id));

    if (toMigrate.length === 0) {
        console.log('✅ No users with long IDs found — nothing to migrate.');
        return;
    }

    console.log(`🔄 Migrating ${toMigrate.length} user(s) to short IDs...`);

    for (const user of toMigrate) {
        const newId = generateShortId();
        console.log(`  ${user.username}: ${user.id} → ${newId}`);

        // SQLite allows updating PKs when foreign_keys pragma is off.
        // We use raw SQL so we can wrap all three tables in a single operation.
        await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF`);

        try {
            await prisma.$transaction([
                // Update child tables first
                prisma.$executeRawUnsafe(
                    `UPDATE user_sessions SET user_id = ? WHERE user_id = ?`,
                    newId, user.id
                ),
                prisma.$executeRawUnsafe(
                    `UPDATE sessions SET user_id = ? WHERE user_id = ?`,
                    newId, user.id
                ),
                // Update the user's own PK last
                prisma.$executeRawUnsafe(
                    `UPDATE users SET id = ? WHERE id = ?`,
                    newId, user.id
                ),
            ]);
            console.log(`  ✅ ${user.username} migrated successfully`);
        } catch (err) {
            console.error(`  ❌ Failed to migrate ${user.username}:`, err.message);
        } finally {
            await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON`);
        }
    }

    console.log('✅ Short ID migration complete.');
}

main()
    .catch(e => { console.error('Migration error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
