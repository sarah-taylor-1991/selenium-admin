#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function getChannelInfo() {
    const botToken = process.env.SAFEGUARD_BOT_TOKEN;

    if (!botToken) {
        console.log('❌ SAFEGUARD_BOT_TOKEN not found in .env file');
        return;
    }

    try {
        console.log('🔍 Getting bot information and recent updates...\n');

        // Get bot info
        const botResponse = await axios.post(`https://api.telegram.org/bot${botToken}/getMe`);
        console.log('🤖 Bot Info:');
        console.log(`   Username: @${botResponse.data.result.username}`);
        console.log(`   ID: ${botResponse.data.result.id}`);
        console.log(`   Can join groups: ${botResponse.data.result.can_join_groups}`);
        console.log(`   Can read all group messages: ${botResponse.data.result.can_read_all_group_messages}`);

        // Get recent updates
        const updatesResponse = await axios.post(`https://api.telegram.org/bot${botToken}/getUpdates`, {
            offset: -20,
            limit: 20
        });

        if (updatesResponse.data.ok) {
            const updates = updatesResponse.data.result;

            console.log(`\n📱 Found ${updates.length} recent updates:`);

            updates.forEach((update, index) => {
                console.log(`\n--- Update ${index + 1} ---`);

                if (update.message) {
                    const chat = update.message.chat;
                    console.log(`Type: message`);
                    console.log(`Chat ID: ${chat.id}`);
                    console.log(`Chat Type: ${chat.type}`);
                    console.log(`Chat Title: ${chat.title || 'N/A'}`);
                    console.log(`Chat Username: @${chat.username || 'N/A'}`);

                    if (update.message.new_chat_members) {
                        console.log(`New members: ${update.message.new_chat_members.length}`);
                        update.message.new_chat_members.forEach(member => {
                            console.log(`  - ${member.first_name} (@${member.username || 'N/A'}) - Bot: ${member.is_bot}`);
                        });
                    }
                }

                if (update.channel_post) {
                    const chat = update.channel_post.chat;
                    console.log(`Type: channel_post`);
                    console.log(`Channel ID: ${chat.id}`);
                    console.log(`Channel Type: ${chat.type}`);
                    console.log(`Channel Title: ${chat.title || 'N/A'}`);
                    console.log(`Channel Username: @${chat.username || 'N/A'}`);

                    if (update.channel_post.new_chat_members) {
                        console.log(`New members: ${update.channel_post.new_chat_members.length}`);
                        update.channel_post.new_chat_members.forEach(member => {
                            console.log(`  - ${member.first_name} (@${member.username || 'N/A'}) - Bot: ${member.is_bot}`);
                        });
                    }
                }
            });

            if (updates.length === 0) {
                console.log('\n💡 No updates found. Try:');
                console.log('1. Send /start to the bot');
                console.log('2. Add the bot to a channel as admin');
                console.log('3. Post a message in the channel');
            }
        } else {
            console.log('❌ Failed to get updates:', updatesResponse.data);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    getChannelInfo().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ Error:', error);
        process.exit(1);
    });
}

module.exports = getChannelInfo;
