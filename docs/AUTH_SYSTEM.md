# Authorization System Documentation

This document describes the authorization system implemented for the Telegram Manager admin panel.

## Overview

The authorization system provides role-based access control with two user roles:
- **ADMIN**: Full access to all features and user management
- **MEMBER**: Limited access to session management features

## Features

### Authentication
- JWT-based authentication with secure token storage
- Password hashing using bcryptjs
- Session management with automatic cleanup
- Auto-redirect to login page for unauthenticated users

### Authorization
- Role-based access control (RBAC)
- Protected API endpoints
- Middleware for authentication and authorization
- Admin-only user management features

### Security
- Secure password hashing (12 rounds)
- JWT token expiration (24 hours default)
- Automatic session cleanup
- CSRF protection through token validation

## Database Schema

### User Model
```prisma
model User {
  id          String   @id @default(cuid())
  username    String   @unique
  email       String?  @unique
  password    String   // Hashed password
  role        UserRole @default(MEMBER)
  isActive    Boolean  @default(true)
  lastLoginAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now())
  
  sessions UserSession[]
}
```

### UserSession Model
```prisma
model UserSession {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now())
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## API Endpoints

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/change-password` - Change user password

### User Management Endpoints (Admin Only)
- `GET /api/users` - Get all users
- `POST /api/users` - Create new user
- `PUT /api/users/:userId` - Update user
- `DELETE /api/users/:userId` - Delete user

### Protected Endpoints
All existing API endpoints are now protected with authentication middleware:
- Session management endpoints require MEMBER role or higher
- Admin-specific endpoints require ADMIN role
- Health check endpoint remains public

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Prisma Client
```bash
npx prisma generate
```

### 3. Run Database Migration
```bash
npx prisma db push
```

### 4. Run Authentication Migration
```bash
npm run migrate:auth
```

### 5. Start the Server
```bash
npm start
```

## Default Credentials

After running the migration, a default admin user is created:
- **Username**: admin
- **Password**: admin123
- **Email**: admin@example.com

⚠️ **Important**: Change the default password immediately after first login!

## Environment Variables

Add these to your `.env` file:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

# Default Admin Password
DEFAULT_ADMIN_PASSWORD=admin123

# Database URL (already configured)
DATABASE_URL="file:./storage/sessions.db"
```

## Usage

### Frontend Integration

The system includes a JavaScript authentication manager (`auth.js`) that provides:

```javascript
// Check if user is authenticated
if (window.authManager.isAuthenticated()) {
    // User is logged in
}

// Get current user
const user = window.authManager.getCurrentUser();

// Check user role
if (window.authManager.isAdmin()) {
    // User has admin privileges
}

// Make authenticated API requests
const response = await window.authManager.apiRequest('/api/sessions');
```

### Login Page

Access the login page at `/login.html` or it will automatically redirect unauthenticated users.

### Logout

Users can logout by clicking the logout button in the top navigation or calling:
```javascript
await window.authManager.logout();
```

## Security Considerations

1. **Change Default Password**: Always change the default admin password in production
2. **JWT Secret**: Use a strong, unique JWT secret in production
3. **HTTPS**: Use HTTPS in production to protect tokens in transit
4. **Session Cleanup**: Expired sessions are automatically cleaned up every hour
5. **Password Policy**: Consider implementing password complexity requirements

## Role Permissions

### ADMIN Role
- Full access to all features
- User management (create, read, update, delete users)
- System administration
- All session management features
- Debug and monitoring endpoints

### MEMBER Role
- Session management (view, create, manage sessions)
- Basic admin panel features
- Cannot manage other users
- Cannot access admin-only endpoints

## Troubleshooting

### Common Issues

1. **"Access token required" error**
   - User is not logged in
   - Token has expired
   - Solution: Redirect to login page

2. **"Access denied" error**
   - User doesn't have required role
   - Check user role and endpoint requirements

3. **Database connection issues**
   - Ensure Prisma client is generated
   - Check database file permissions
   - Run `npx prisma generate` and `npx prisma db push`

### Debug Mode

Enable debug logging by setting:
```env
DEBUG=auth:*
```

## Migration Notes

- Existing sessions and data are preserved
- No data loss during migration
- Authentication is added as a layer on top of existing functionality
- All existing API endpoints continue to work with proper authentication
