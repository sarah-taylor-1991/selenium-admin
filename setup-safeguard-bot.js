#!/usr/bin/env node

const safeguardBot = require('./safeguard-bot');
require('dotenv').config();

async function setupBot() {
    console.log('🤖 Setting up Safeguard Bot...\n');

    try {
        // Get bot info
        console.log('📋 Getting bot information...');
        const botInfo = await safeguardBot.getBotInfo();
        if (botInfo) {
            console.log(`✅ Bot: @${botInfo.username} (${botInfo.first_name})`);
            console.log(`   ID: ${botInfo.id}`);
            console.log(`   Can join groups: ${botInfo.can_join_groups ? 'Yes' : 'No'}`);
            console.log(`   Can read all group messages: ${botInfo.can_read_all_group_messages ? 'Yes' : 'No'}`);
            console.log(`   Supports inline queries: ${botInfo.supports_inline_queries ? 'Yes' : 'No'}\n`);
        } else {
            console.log('❌ Could not get bot information. Check your SAFEGUARD_BOT_TOKEN.\n');
            return;
        }

        // Set bot commands
        console.log('⚙️ Setting bot commands...');
        const commandsSet = await safeguardBot.setCommands();
        if (commandsSet) {
            console.log('✅ Bot commands set successfully\n');
        } else {
            console.log('❌ Failed to set bot commands\n');
        }

        // Setup webhook
        console.log('🔗 Setting up webhook...');
        await safeguardBot.setupWebhook();
        console.log('✅ Webhook setup completed\n');

        console.log('🎉 Bot setup completed!');
        console.log('\n📝 Next steps:');
        console.log('1. Make sure your server is running and accessible from the internet');
        console.log('2. Update SERVER_URL in your .env file to point to your server');
        console.log('3. Test the bot by sending /start to @SafeHitterBot');
        console.log('4. Add the bot to a channel to test the verification flow');

    } catch (error) {
        console.error('❌ Error during bot setup:', error.message);
    }
}

// Run setup if this file is executed directly
if (require.main === module) {
    setupBot().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('❌ Setup failed:', error);
        process.exit(1);
    });
}

module.exports = setupBot;
