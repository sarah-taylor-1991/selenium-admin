# Database System Documentation

## Overview

The Telegram Manager server now uses SQLite for persistent session storage instead of file-based JSON storage. This provides better data integrity, querying capabilities, and performance.

## Database Schema

### Sessions Table

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    socket_id TEXT,
    status TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    parameters TEXT,
    error TEXT,
    qr_code_path TEXT,
    screenshot_path TEXT,
    localStorage_path TEXT,
    username TEXT,
    avatar_src TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Field Descriptions

- `id`: Unique session identifier
- `socket_id`: WebSocket connection ID for active sessions
- `status`: Session status (starting, running, completed, error)
- `start_time`: When the session started
- `end_time`: When the session completed or failed
- `parameters`: JSON string of session parameters
- `error`: Error message if session failed
- `qr_code_path`: Path to generated QR code image
- `screenshot_path`: Path to session screenshot
- `localStorage_path`: Path to extracted localStorage data
- `username`: Telegram username (if extracted)
- `avatar_src`: Telegram avatar URL (if extracted)
- `created_at`: When the session record was created
- `updated_at`: When the session was last updated

## Migration from JSON

If you have existing sessions stored in `storage/sessions.json`, you can migrate them to the new database:

```bash
npm run migrate
```

This will:
1. Read all existing sessions from the JSON file
2. Import them into the SQLite database
3. Create a backup of the original file
4. Skip any currently active sessions

## Database Utilities

The system includes several utility commands for database management:

### View Database Statistics

```bash
npm run db:stats
```

Shows:
- Total sessions count
- Active vs completed vs error sessions
- Sessions with various types of data (QR codes, screenshots, etc.)

### Clean Up Old Sessions

```bash
npm run db:cleanup [days]
```

Shows sessions older than the specified number of days (default: 30) that could be cleaned up.

### Export Sessions

```bash
npm run db:export [format]
```

Exports all sessions in the specified format (currently only JSON supported).

### Search Sessions

```bash
npm run db:search <query>
```

Searches sessions by ID, username, status, or error message.

## API Changes

### WebSocket Events

All session-related WebSocket events now use the database:

- `getSessionStatus`: Retrieves session from database
- `getAllSessions`: Gets all sessions from database
- `clearCompletedSessions`: Removes completed/error sessions from database

### HTTP Endpoints

- `GET /api/sessions`: Returns all sessions from database
- `GET /api/sessions/:sessionId`: Returns specific session from database
- `GET /health`: Includes database connection status

## Performance Benefits

1. **Faster Queries**: SQLite provides indexed queries instead of loading entire JSON files
2. **Better Memory Usage**: Only active sessions are kept in memory
3. **Data Integrity**: ACID compliance ensures data consistency
4. **Concurrent Access**: Multiple processes can safely access the database
5. **Backup & Recovery**: Easier to backup and restore individual databases

## File Locations

- **Database**: `storage/sessions.db`
- **Backup**: `storage/sessions.json.backup` (after migration)
- **Old Sessions**: `storage/sessions.json` (if migration was run)

## Error Handling

The system gracefully handles database errors:

- Failed database operations are logged but don't crash the server
- Fallback responses are provided when database queries fail
- Health check endpoint shows database status

## Maintenance

### Regular Cleanup

Consider running cleanup periodically to remove old sessions:

```bash
# Clean up sessions older than 7 days
npm run db:cleanup 7
```

### Database Backup

The SQLite database file can be backed up using standard file backup tools:

```bash
cp storage/sessions.db storage/sessions.db.backup
```

### Database Reset

To reset the database (⚠️ **WARNING**: This will delete all data):

```bash
rm storage/sessions.db
# Restart the server - it will create a new empty database
```

## Troubleshooting

### Database Locked

If you see "database is locked" errors:
1. Ensure no other processes are accessing the database
2. Check if the server is running multiple instances
3. Restart the server

### Migration Issues

If migration fails:
1. Check the backup file was created
2. Verify the old JSON file is valid
3. Check database permissions in the storage directory

### Performance Issues

For large numbers of sessions:
1. Consider adding database indexes on frequently queried fields
2. Implement pagination for session listing
3. Archive very old sessions to separate tables 