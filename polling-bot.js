const safeguardBot = require('./safeguard-bot');
require('dotenv').config();

class PollingBot {
    constructor() {
        this.botToken = process.env.SAFEGUARD_BOT_TOKEN;
        this.enabled = !!this.botToken;
        this.lastUpdateId = 0;
        this.pollingInterval = 5000; // Poll every 5 seconds
        this.isPolling = false;
    }

    /**
     * Start polling for updates
     */
    async startPolling() {
        if (!this.enabled) {
            console.log('⚠️ Polling bot disabled - missing SAFEGUARD_BOT_TOKEN');
            return;
        }

        console.log('🔄 Starting polling for bot updates...');
        this.isPolling = true;
        this.pollForUpdates();
    }

    /**
     * Stop polling
     */
    stopPolling() {
        console.log('⏹️ Stopping polling...');
        this.isPolling = false;
    }

    /**
     * Poll for updates from Telegram
     */
    async pollForUpdates() {
        if (!this.isPolling) {
            console.log('⚠️ Polling stopped, not polling for updates');
            return;
        }

        console.log('🔄 Polling for updates...');
        try {
            const updates = await this.getUpdates();
            console.log(`📊 Got ${updates ? updates.length : 0} updates`);

            if (updates && updates.length > 0) {
                for (const update of updates) {
                    console.log('📱 Received update:', JSON.stringify(update, null, 2));
                    await safeguardBot.handleUpdate(update);
                }
            }
        } catch (error) {
            console.error('❌ Error polling updates:', error.message);
        }

        // Schedule next poll
        if (this.isPolling) {
            setTimeout(() => this.pollForUpdates(), this.pollingInterval);
        }
    }

    /**
     * Get updates from Telegram API
     */
    async getUpdates() {
        try {
            const axios = require('axios');
            const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`;

            const response = await axios.post(url, {
                offset: this.lastUpdateId + 1,
                timeout: 10,
                limit: 10
            }, {
                timeout: 15000 // 15 second axios timeout
            });

            if (response.data.ok) {
                const updates = response.data.result;

                // Update last update ID
                if (updates.length > 0) {
                    this.lastUpdateId = updates[updates.length - 1].update_id;
                }

                return updates;
            } else {
                console.error('❌ Telegram API error:', response.data);
                return [];
            }
        } catch (error) {
            // Only log error if it's not a 401 (unauthorized) - 401 is expected when token is missing
            if (error.response && error.response.status === 401) {
                // Silently skip - token is missing or invalid, polling is disabled
                return [];
            } else {
                console.error('❌ Failed to get updates:', error.message);
            }
            return [];
        }
    }

    /**
     * Clear webhook to enable polling
     */
    async clearWebhook() {
        if (!this.enabled) {
            console.log('⚠️ Skipping webhook clear - polling bot disabled (missing SAFEGUARD_BOT_TOKEN)');
            return;
        }

        try {
            const axios = require('axios');
            const url = `https://api.telegram.org/bot${this.botToken}/deleteWebhook`;

            const response = await axios.post(url, {
                drop_pending_updates: true
            });

            if (response.data.ok) {
                console.log('✅ Webhook cleared successfully');
            } else {
                console.log('⚠️ Webhook clear response:', response.data);
            }
        } catch (error) {
            // Only log error if it's not a 401 (unauthorized) - 401 is expected when token is missing
            if (error.response && error.response.status === 401) {
                console.log('⚠️ Webhook clear skipped - invalid or missing bot token');
            } else {
                console.error('❌ Error clearing webhook:', error.message);
            }
        }
    }
}

// Create and export polling bot instance
const pollingBot = new PollingBot();

// Start polling if this file is run directly
if (require.main === module) {
    pollingBot.clearWebhook().then(() => {
        pollingBot.startPolling();
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down polling bot...');
        pollingBot.stopPolling();
        process.exit(0);
    });
}

module.exports = pollingBot;