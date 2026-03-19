#!/usr/bin/env node

const {
    PrismaClient
} = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting authentication system migration...');

    try {
        // Check if users table already has data
        const existingUsers = await prisma.user.findMany();

        if (existingUsers.length === 0) {
            console.log('📝 No existing users found. Creating default admin user...');

            // Create default admin user
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
            const hashedPassword = await bcrypt.hash(defaultPassword, 12);

            const adminUser = await prisma.user.create({
                data: {
                    username: 'admin',
                    email: 'admin@example.com',
                    password: hashedPassword,
                    role: 'ADMIN',
                    isActive: true
                }
            });

            console.log('✅ Default admin user created successfully!');
            console.log(`   Username: ${adminUser.username}`);
            console.log(`   Email: ${adminUser.email}`);
            console.log(`   Password: ${defaultPassword}`);
            console.log('⚠️  Please change the default password after first login!');
        } else {
            console.log(`📊 Found ${existingUsers.length} existing users. Skipping default user creation.`);
        }

        // Clean up any expired sessions
        const expiredSessions = await prisma.userSession.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date()
                }
            }
        });

        if (expiredSessions.count > 0) {
            console.log(`🧹 Cleaned up ${expiredSessions.count} expired user sessions`);
        }

        console.log('✅ Authentication system migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();