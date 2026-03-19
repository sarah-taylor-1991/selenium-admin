#!/usr/bin/env node

const safeguardBot = require('./safeguard-bot');
require('dotenv').config();

async function sendToChannel() {
    console.log('📱 Sending verification message to channel...\n');

    try {
        // You need to replace this with your actual channel ID
        // Channel IDs typically start with -100
        const channelId = process.argv[2];

        if (!channelId) {
            console.log('❌ Please provide channel ID as argument');
            console.log('Usage: node send-to-channel.js -1001234567890');
            console.log('\nTo get your channel ID:');
            console.log('1. Add @userinfobot to your channel');
            console.log('2. Send /start to @userinfobot');
            console.log('3. Copy the channel ID (starts with -100)');
            return;
        }

        console.log(`📺 Sending to channel: ${channelId}`);

        // Send channel detection message
        console.log('📋 Sending channel detection message...');
        await safeguardBot.sendChannelDetectionMessage(channelId, 'Test Channel');

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Send protection message
        console.log('🛡️ Sending protection message...');
        await safeguardBot.sendProtectionMessage(channelId, 'Test Channel');

        console.log('✅ Messages sent successfully!');
        console.log('\n📝 Check your channel - you should see both messages!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    sendToChannel().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ Error:', error);
        process.exit(1);
    });
}

module.exports = sendToChannel;
