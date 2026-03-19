#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function getChatId() {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
        console.log('❌ TELEGRAM_BOT_TOKEN not found in environment variables');
        console.log('💡 Please set your bot token in a .env file or environment variable');
        return;
    }

    console.log('🤖 Bot Token found, fetching updates...\n');

    try {
        // Get recent updates from the bot
        const response = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates`);

        if (response.data.ok) {
            const updates = response.data.result;

            if (updates.length === 0) {
                console.log('📭 No recent messages found.');
                console.log('💡 To get your chat ID:');
                console.log('   1. Send a message to your bot (@NexoraXQJ_bot)');
                console.log('   2. Run this script again');
                console.log('   3. The chat ID will be displayed below');
                return;
            }

            console.log('📱 Recent messages and chat IDs:');
            console.log('================================\n');

            // Group by chat_id to avoid duplicates
            const chatIds = new Set();

            updates.forEach((update, index) => {
                if (update.message) {
                    const chat = update.message.chat;
                    const chatId = chat.id;
                    const chatType = chat.type;
                    const chatTitle = chat.title || chat.first_name || 'Unknown';
                    const username = chat.username ? `@${chat.username}` : 'No username';
                    const messageText = update.message.text || '[Non-text message]';

                    if (!chatIds.has(chatId)) {
                        chatIds.add(chatId);
                        console.log(`💬 Chat ID: ${chatId}`);
                        console.log(`   Type: ${chatType}`);
                        console.log(`   Name: ${chatTitle}`);
                        console.log(`   Username: ${username}`);
                        console.log(`   Last message: "${messageText}"`);
                        console.log('');
                    }
                }
            });

            console.log('🔧 To use a chat ID, add this to your .env file:');
            console.log(`TELEGRAM_CHAT_ID=<chat_id_from_above>`);
            console.log('\n💡 For private chats, use the numeric chat ID');
            console.log('💡 For group chats, use the numeric chat ID (usually negative)');

        } else {
            console.log('❌ Failed to get updates:', response.data);
        }

    } catch (error) {
        console.error('❌ Error fetching updates:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the script
getChatId().catch(console.error);
