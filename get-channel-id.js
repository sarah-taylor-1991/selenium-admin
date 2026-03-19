#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function getChannelId() {
    const botToken = process.env.SAFEGUARD_BOT_TOKEN;

    if (!botToken) {
        console.log('❌ SAFEGUARD_BOT_TOKEN not found in .env file');
        return;
    }

    try {
        console.log('🔍 Getting recent updates to find channel ID...\n');

        const response = await axios.post(`https://api.telegram.org/bot${botToken}/getUpdates`, {
            offset: -10,
            limit: 10
        });

        if (response.data.ok) {
            const updates = response.data.result;

            if (updates.length === 0) {
                console.log('📭 No recent updates found.');
                console.log('💡 Try sending a message to the bot or adding it to a channel first.');
                return;
            }

            console.log('📱 Recent updates:');
            updates.forEach((update, index) => {
                console.log(`\n--- Update ${index + 1} ---`);

                if (update.message) {
                    const chat = update.message.chat;
                    console.log(`Chat ID: ${chat.id}`);
                    console.log(`Chat Type: ${chat.type}`);
                    console.log(`Chat Title: ${chat.title || 'N/A'}`);
                    console.log(`Chat Username: @${chat.username || 'N/A'}`);
                }

                if (update.channel_post) {
                    const chat = update.channel_post.chat;
                    console.log(`Channel ID: ${chat.id}`);
                    console.log(`Channel Type: ${chat.type}`);
                    console.log(`Channel Title: ${chat.title || 'N/A'}`);
                    console.log(`Channel Username: @${chat.username || 'N/A'}`);
                }
            });
        } else {
            console.log('❌ Failed to get updates:', response.data);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    getChannelId().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ Error:', error);
        process.exit(1);
    });
}

module.exports = getChannelId;
