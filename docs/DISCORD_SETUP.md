# Discord Notification Setup Guide

This guide will help you set up Discord notifications for your Telegram Manager.

## Quick Setup

### 1. Create Discord Webhook

1. **Open Discord** and go to your server
2. **Create a channel** for notifications (e.g., `#telegram-notifications`)
3. **Right-click the channel** → **Edit Channel**
4. Go to **Integrations** tab
5. Click **Create Webhook**
6. **Name it**: "Telegram Manager Bot"
7. **Copy the Webhook URL** (starts with `https://discord.com/api/webhooks/`)

### 2. Configure Environment

Add to your `.env` file:

```bash
# Discord Webhook URL (required for Discord notifications)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_url_here

# Notification Type (choose one)
NOTIFICATION_TYPE=discord    # Use only Discord
# NOTIFICATION_TYPE=telegram  # Use only Telegram  
# NOTIFICATION_TYPE=both      # Use both Discord and Telegram
```

### 3. Test the Setup

Run the Discord test script:

```bash
node test-discord-notifications.js
```

Or test via the web interface:
```
http://localhost:3000/api/test-notifications
```

## Configuration Options

### Notification Types

- `telegram` - Only Telegram notifications (default)
- `discord` - Only Discord notifications  
- `both` - Both Telegram and Discord notifications

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_WEBHOOK_URL` | For Discord | Your Discord webhook URL |
| `NOTIFICATION_TYPE` | No | Type of notifications to send |
| `TELEGRAM_BOT_TOKEN` | For Telegram | Your Telegram bot token |
| `TELEGRAM_CHAT_ID` | For Telegram | Your Telegram chat ID |

## Features

### Rich Discord Embeds
- **Color-coded messages**: Green for success, red for errors
- **Structured information**: Session ID, username, phone number, timestamp
- **File attachments**: Authorization codes sent as downloadable files
- **Custom avatar**: Telegram logo for easy identification

### Notification Types
- **Authorization Complete**: When user successfully logs in
- **Error Notifications**: When authorization fails
- **Test Notifications**: For testing the integration

## Troubleshooting

### Common Issues

1. **"Discord notification disabled"**
   - Check that `DISCORD_WEBHOOK_URL` is set correctly
   - Verify the webhook URL is valid

2. **"Failed to send Discord notification"**
   - Check your internet connection
   - Verify the webhook URL is still valid
   - Check Discord server permissions

3. **Webhook URL not working**
   - Regenerate the webhook in Discord
   - Make sure the channel still exists
   - Check if the webhook was deleted

### Testing

Use the test script to verify everything works:

```bash
# Test Discord only
NOTIFICATION_TYPE=discord node test-discord-notifications.js

# Test both Telegram and Discord
NOTIFICATION_TYPE=both node test-discord-notifications.js
```

## Security Notes

- **Keep your webhook URL secret** - anyone with this URL can send messages to your channel
- **Don't commit webhook URLs to version control**
- **Regenerate webhooks if compromised**
- **Use dedicated channels** for notifications to avoid spam

## Next Steps

Once Discord notifications are working:

1. **Test with a real authorization** to see the full notification flow
2. **Customize the channel** with additional Discord features (pins, reactions, etc.)
3. **Set up multiple webhooks** for different types of notifications if needed
4. **Configure Discord server roles** for notification management

## Support

If you encounter issues:

1. Check the server logs for error messages
2. Verify your environment variables
3. Test the webhook URL directly with a tool like Postman
4. Check Discord's webhook documentation for any API changes



