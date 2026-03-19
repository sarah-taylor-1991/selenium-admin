/**
 * Migration Script: Fix Session Statuses
 * 
 * Problem: Sessions with valid localStorage data have incorrect statuses 
 * (disconnected, closed) instead of 'completed'
 * 
 * Solution: Update all sessions that have localStorage data to status='completed'
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSessionStatuses() {
  console.log('🔧 Starting session status migration...\n');

  try {
    // Find all sessions that have localStorage but wrong status
    const sessionsToFix = await prisma.session.findMany({
      where: {
        localStorageCode: {
          not: null
        },
        status: {
          notIn: ['completed', 'failed']
        }
      }
    });

    console.log(`📊 Found ${sessionsToFix.length} sessions to fix\n`);

    if (sessionsToFix.length === 0) {
      console.log('✅ No sessions need fixing!');
      return;
    }

    // Show sessions before fixing
    console.log('Sessions that will be updated:');
    console.log('='.repeat(80));
    sessionsToFix.forEach((session, index) => {
      console.log(`${index + 1}. ID: ${session.id}`);
      console.log(`   Current Status: ${session.status}`);
      console.log(`   Username: ${session.username || 'Unknown'}`);
      console.log(`   Has localStorage: Yes`);
      console.log(`   Started: ${session.startTime.toISOString()}`);
      console.log('');
    });

    // Ask for confirmation (in a real scenario, you might want to prompt)
    console.log('🔄 Updating statuses to "completed"...\n');

    // Update all sessions
    const updateResult = await prisma.session.updateMany({
      where: {
        localStorageCode: {
          not: null
        },
        status: {
          notIn: ['completed', 'failed']
        }
      },
      data: {
        status: 'completed'
      }
    });

    console.log(`✅ Successfully updated ${updateResult.count} sessions to status='completed'\n`);

    // Show updated sessions
    const updatedSessions = await prisma.session.findMany({
      where: {
        id: {
          in: sessionsToFix.map(s => s.id)
        }
      },
      select: {
        id: true,
        status: true,
        username: true
      }
    });

    console.log('Updated sessions:');
    console.log('='.repeat(80));
    updatedSessions.forEach((session, index) => {
      console.log(`${index + 1}. ID: ${session.id}`);
      console.log(`   New Status: ✅ ${session.status}`);
      console.log(`   Username: ${session.username || 'Unknown'}`);
      console.log('');
    });

    console.log('🎉 Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`   - Sessions fixed: ${updateResult.count}`);
    console.log(`   - All sessions with localStorage now have status='completed'`);
    console.log(`   - Instant login buttons should now work for these sessions`);

  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
if (require.main === module) {
  fixSessionStatuses()
    .then(() => {
      console.log('\n✅ Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixSessionStatuses };

