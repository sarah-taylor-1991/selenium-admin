const telegramNotifier = require('./telegram-bot-notifier');
const discordNotifier = require('./discord-notifier');
require('dotenv').config();

class NotificationManager {
    constructor() {
        this.notificationType = process.env.NOTIFICATION_TYPE || 'telegram';
        this.telegramEnabled = telegramNotifier.enabled;
        this.discordEnabled = discordNotifier.enabled;

        console.log('🔔 Notification Manager initialized:');
        console.log(`   - Type: ${this.notificationType}`);
        console.log(`   - Telegram: ${this.telegramEnabled ? '✅' : '❌'}`);
        console.log(`   - Discord: ${this.discordEnabled ? '✅' : '❌'}`);

        // Validate configuration
        this.validateConfiguration();
    }

    /**
     * Validate the notification configuration
     */
    validateConfiguration() {
        if (this.notificationType === 'telegram' && !this.telegramEnabled) {
            console.warn('⚠️ Notification type set to "telegram" but Telegram is not configured');
        }

        if (this.notificationType === 'discord' && !this.discordEnabled) {
            console.warn('⚠️ Notification type set to "discord" but Discord is not configured');
        }

        if (this.notificationType === 'both' && !this.telegramEnabled && !this.discordEnabled) {
            console.warn('⚠️ Notification type set to "both" but neither Telegram nor Discord is configured');
        }

        if (this.notificationType === 'both' && !this.telegramEnabled) {
            console.warn('⚠️ Discord will be used (Telegram not configured)');
        }

        if (this.notificationType === 'both' && !this.discordEnabled) {
            console.warn('⚠️ Telegram will be used (Discord not configured)');
        }
    }

    /**
     * Send authorization completion notification
     * @param {string} sessionId - The session ID
     * @param {Object} userInfo - User information
     * @param {string} authCode - The authorization code (localStorage values)
     * @param {string} userId - The user ID to fetch username from database
     * @returns {Promise<Object>} - Results from all enabled notifiers
     */
    async sendAuthorizationComplete(sessionId, userInfo = {}, authCode = null, userId = null) {
        const results = {
            telegram: {
                success: false,
                error: null
            },
            discord: {
                success: false,
                error: null
            }
        };

        const promises = [];

        // Send Telegram notification if enabled
        if (this.shouldSendTelegram()) {
            promises.push(
                telegramNotifier.sendAuthorizationComplete(sessionId, userInfo, authCode, false, userId)
                .then(success => {
                    results.telegram.success = success;
                })
                .catch(error => {
                    results.telegram.error = error.message;
                    console.error('❌ Telegram notification failed:', error.message);
                })
            );
        }

        // Send Discord notification if enabled
        if (this.shouldSendDiscord()) {
            promises.push(
                discordNotifier.sendAuthorizationComplete(sessionId, userInfo, authCode, userId)
                .then(success => {
                    results.discord.success = success;
                })
                .catch(error => {
                    results.discord.error = error.message;
                    console.error('❌ Discord notification failed:', error.message);
                })
            );
        }

        // Wait for all notifications to complete
        if (promises.length > 0) {
            await Promise.allSettled(promises);
        }

        // Log results
        this.logResults('Authorization Complete', results);

        return results;
    }

    /**
     * Send error notification
     * @param {string} sessionId - The session ID
     * @param {string} error - Error message
     * @returns {Promise<Object>} - Results from all enabled notifiers
     */
    async sendError(sessionId, error) {
        const results = {
            telegram: {
                success: false,
                error: null
            },
            discord: {
                success: false,
                error: null
            }
        };

        const promises = [];

        // Send Telegram notification if enabled
        if (this.shouldSendTelegram()) {
            promises.push(
                telegramNotifier.sendError(sessionId, error)
                .then(success => {
                    results.telegram.success = success;
                })
                .catch(error => {
                    results.telegram.error = error.message;
                    console.error('❌ Telegram error notification failed:', error.message);
                })
            );
        }

        // Send Discord notification if enabled
        if (this.shouldSendDiscord()) {
            promises.push(
                discordNotifier.sendError(sessionId, error)
                .then(success => {
                    results.discord.success = success;
                })
                .catch(error => {
                    results.discord.error = error.message;
                    console.error('❌ Discord error notification failed:', error.message);
                })
            );
        }

        // Wait for all notifications to complete
        if (promises.length > 0) {
            await Promise.allSettled(promises);
        }

        // Log results
        this.logResults('Error', results);

        return results;
    }

    /**
     * Send test notification
     * @returns {Promise<Object>} - Results from all enabled notifiers
     */
    async sendTestNotification() {
        const results = {
            telegram: {
                success: false,
                error: null
            },
            discord: {
                success: false,
                error: null
            }
        };

        const promises = [];

        // Send Telegram notification if enabled
        if (this.shouldSendTelegram()) {
            promises.push(
                telegramNotifier.sendTestNotification()
                .then(success => {
                    results.telegram.success = success;
                })
                .catch(error => {
                    results.telegram.error = error.message;
                    console.error('❌ Telegram test notification failed:', error.message);
                })
            );
        }

        // Send Discord notification if enabled
        if (this.shouldSendDiscord()) {
            promises.push(
                discordNotifier.sendTestNotification()
                .then(success => {
                    results.discord.success = success;
                })
                .catch(error => {
                    results.discord.error = error.message;
                    console.error('❌ Discord test notification failed:', error.message);
                })
            );
        }

        // Wait for all notifications to complete
        if (promises.length > 0) {
            await Promise.allSettled(promises);
        }

        // Log results
        this.logResults('Test', results);

        return results;
    }

    /**
     * Determine if Telegram notification should be sent
     * @returns {boolean}
     */
    shouldSendTelegram() {
        return this.telegramEnabled &&
            (this.notificationType === 'telegram' || this.notificationType === 'both');
    }

    /**
     * Determine if Discord notification should be sent
     * @returns {boolean}
     */
    shouldSendDiscord() {
        return this.discordEnabled &&
            (this.notificationType === 'discord' || this.notificationType === 'both');
    }

    /**
     * Log notification results
     * @param {string} type - Type of notification
     * @param {Object} results - Results from notifiers
     */
    logResults(type, results) {
        console.log(`📊 ${type} notification results:`);

        if (this.shouldSendTelegram()) {
            const status = results.telegram.success ? '✅' : '❌';
            const error = results.telegram.error ? ` (${results.telegram.error})` : '';
            console.log(`   - Telegram: ${status}${error}`);
        }

        if (this.shouldSendDiscord()) {
            const status = results.discord.success ? '✅' : '❌';
            const error = results.discord.error ? ` (${results.discord.error})` : '';
            console.log(`   - Discord: ${status}${error}`);
        }
    }

    /**
     * Get notification status
     * @returns {Object} - Status of all notifiers
     */
    getStatus() {
        return {
            type: this.notificationType,
            telegram: {
                enabled: this.telegramEnabled,
                shouldSend: this.shouldSendTelegram()
            },
            discord: {
                enabled: this.discordEnabled,
                shouldSend: this.shouldSendDiscord()
            }
        };
    }
}

// Create singleton instance
const notificationManager = new NotificationManager();

module.exports = notificationManager;