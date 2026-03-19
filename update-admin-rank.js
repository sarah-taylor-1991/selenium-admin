const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateAdminRank() {
    try {
        // Find the admin user
        const adminUser = await prisma.user.findFirst({
            where: {
                role: 'ADMIN'
            }
        });

        if (!adminUser) {
            console.log('No admin user found');
            return;
        }

        console.log('Found admin user:', adminUser.username, 'Current rank:', adminUser.rank);

        // Update the admin user's rank to SHADOWMASTER
        const updatedUser = await prisma.user.update({
            where: {
                id: adminUser.id
            },
            data: {
                rank: 'SHADOWMASTER'
            }
        });

        console.log('Updated admin user rank to:', updatedUser.rank);
        console.log('Admin user updated successfully!');
    } catch (error) {
        console.error('Error updating admin rank:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateAdminRank();


