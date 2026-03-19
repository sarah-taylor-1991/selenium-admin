# Safeguard Bot - Telegram Bot Implementation

This document describes the Safeguard Bot implementation that handles the verification flow for Telegram channels.

## Bot Flow

1. **User starts bot** with `/start` command
2. **Bot responds** with welcome message containing 4 options:
   - Add to Channel
   - Support  
   - Visit Channel
   - Tutorial
3. **User adds bot to channel** using "Add to Channel" button
4. **Bot detects channel addition** and sends: "Channel detected: [ChannelName]. Please choose the bot you'd like to use for setting up verification."
5. **User clicks "Safeguard"** button
6. **Bot sends protection message** with "Tap to verify" button that launches the mini app

## Setup Instructions

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` command
3. Choose a name for your bot (e.g., "SafeHitter Bot")
4. Choose a username (e.g., "SafeHitterBot")
5. Copy the bot token provided

### 2. Configure Environment Variables

Create a `.env` file in the `selenium-admin` directory with the following variables:

```env
# Safeguard Bot Configuration
SAFEGUARD_BOT_TOKEN=your_bot_token_from_botfather
WEB_APP_URL=https://your-mini-app-url.com
SERVER_URL=https://your-server.com

# Existing variables (keep these)
TELEGRAM_BOT_TOKEN=your_existing_bot_token
TELEGRAM_CHAT_ID=your_chat_id
PORT=3000
NODE_ENV=development
```

### 3. Set Up Webhook

The bot uses webhooks to receive updates from Telegram. Make sure your server is accessible from the internet.

1. **For local development**: Use ngrok or similar tool to expose your local server
2. **For production**: Deploy your server and update `SERVER_URL` in `.env`

### 4. Initialize the Bot

Run the setup script to configure the bot:

```bash
npm run setup:bot
```

This will:
- Verify the bot token
- Set up bot commands
- Configure the webhook
- Display bot information

### 5. Start the Server

```bash
npm start
# or for development
npm run dev
```

## Bot Features

### Commands

- `/start` - Shows the welcome message with 4 interactive buttons

### Interactive Buttons

1. **Add to Channel** - Opens Telegram's channel selection interface
2. **Support** - Links to support channel
3. **Visit Channel** - Links to main channel
4. **Tutorial** - Links to tutorial channel

### Channel Integration

When the bot is added to a channel:
- Detects the channel name
- Sends channel detection message
- Provides "Safeguard" button for verification setup
- Sends protection message with mini app launch button

## API Endpoints

### Webhook Endpoint

```
POST /webhook/safeguard
```

Receives updates from Telegram and processes them according to the bot flow.

## Customization

### Update Button URLs

Edit the `sendWelcomeMessage` method in `safeguard-bot.js`:

```javascript
const keyboard = {
    inline_keyboard: [
        [
            {
                text: "➕ Add to Channel",
                url: `https://t.me/SafeHitterBot?startgroup=add`
            },
            {
                text: "💬 Support",
                url: "https://t.me/your_support_channel"  // Update this
            }
        ],
        [
            {
                text: "🌐 Visit Channel",
                url: "https://t.me/your_channel"  // Update this
            },
            {
                text: "📖 Tutorial",
                url: "https://t.me/your_tutorial_channel"  // Update this
            }
        ]
    ]
};
```

### Update Mini App URL

Update the `WEB_APP_URL` environment variable to point to your mini app.

### Customize Messages

Edit the message templates in the bot methods:
- `sendWelcomeMessage()` - Welcome message
- `sendChannelDetectionMessage()` - Channel detection message  
- `sendProtectionMessage()` - Protection message

## Testing

1. **Test bot setup**:
   ```bash
   npm run setup:bot
   ```

2. **Test /start command**:
   - Message your bot with `/start`
   - Verify all 4 buttons appear and work

3. **Test channel addition**:
   - Add bot to a test channel
   - Verify channel detection message appears
   - Click "Safeguard" button
   - Verify protection message with mini app button appears

## Troubleshooting

### Bot Not Responding

1. Check bot token in `.env` file
2. Verify webhook is set correctly
3. Check server logs for errors
4. Ensure server is accessible from internet

### Webhook Issues

1. Verify `SERVER_URL` is correct and accessible
2. Check webhook status: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
3. Delete webhook if needed: `https://api.telegram.org/bot<TOKEN>/deleteWebhook`

### Channel Detection Not Working

1. Ensure bot has admin permissions in the channel
2. Check that bot can read messages
3. Verify webhook is receiving updates

## File Structure

```
selenium-admin/
├── safeguard-bot.js              # Main bot implementation
├── setup-safeguard-bot.js       # Bot setup script
├── server.js                    # Server with webhook endpoint
├── env.example                  # Environment variables template
└── SAFEGUARD_BOT_README.md     # This documentation
```

## Security Notes

- Keep your bot token secure and never commit it to version control
- Use HTTPS for webhook URLs in production
- Regularly rotate bot tokens if compromised
- Monitor webhook logs for suspicious activity

