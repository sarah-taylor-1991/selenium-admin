const sessionDB = require('./database');

async function fixStuckSessions() {
    console.log('🔧 Fixing stuck sessions...');

    try {
        // Get all sessions (admin utility - no user filtering)
        const allSessions = await sessionDB.getAllSessions(null);

        // Find stuck sessions (starting for more than 5 minutes)
        const stuckSessions = allSessions.filter(s =>
            s.status === 'starting' &&
            s.startTime &&
            (new Date() - new Date(s.startTime)) > 300000 // More than 5 minutes
        );

        console.log(`📊 Found ${stuckSessions.length} stuck sessions`);

        if (stuckSessions.length === 0) {
            console.log('✅ No stuck sessions found');
            return;
        }

        // Try to fix each stuck session
        for (const session of stuckSessions) {
            console.log(`\n🔧 Fixing session: ${session.id}`);

            // Check if session has QR code but no user info
            if (session.qrCodePath && !session.username) {
                console.log(`  - Session has QR code but no user info`);
                console.log(`  - Duration: ${Math.round((new Date() - new Date(session.startTime)) / 1000)}s`);

                // Try to determine if this session should be marked as completed or error
                const duration = new Date() - new Date(session.startTime);
                const durationMinutes = Math.round(duration / 60000);

                if (durationMinutes > 10) {
                    // Session has been running for more than 10 minutes, likely failed
                    console.log(`  - Session running for ${durationMinutes} minutes, marking as error`);

                    await sessionDB.updateSession(session.id, {
                        status: 'error',
                        error: 'Session stuck in starting status - likely failed to complete login',
                        endTime: new Date()
                    });

                    console.log(`  ✅ Session ${session.id} marked as error`);
                } else {
                    // Session might still be active, try to mark as running
                    console.log(`  - Session running for ${durationMinutes} minutes, marking as running`);

                    await sessionDB.updateSession(session.id, {
                        status: 'running'
                    });

                    console.log(`  ✅ Session ${session.id} marked as running`);
                }
            } else {
                console.log(`  - Session ${session.id} doesn't need fixing`);
            }
        }

        console.log('\n🎉 Stuck session fix completed!');

        // Show updated status
        const updatedSessions = await sessionDB.getAllSessions(null);
        const statusCounts = {};
        updatedSessions.forEach(s => {
            statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
        });

        console.log('\n📊 Updated session statuses:');
        Object.keys(statusCounts).forEach(status => {
            console.log(`  ${status.toUpperCase()}: ${statusCounts[status]}`);
        });

    } catch (error) {
        console.error('❌ Error fixing stuck sessions:', error);
    } finally {
        await sessionDB.close();
        console.log('🔒 Database connection closed');
    }
}

// Run the fix
fixStuckSessions();