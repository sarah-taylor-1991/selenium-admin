-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "tg_username" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" REAL NOT NULL DEFAULT 0.0,
    "lastLoginAt" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banDuration" TEXT,
    "banExpiresAt" DATETIME,
    "bannedAt" DATETIME,
    "bannedBy" TEXT
);
INSERT INTO "new_users" ("banDuration", "banExpiresAt", "banReason", "bannedAt", "bannedBy", "created_at", "email", "id", "isActive", "isBanned", "lastLoginAt", "password", "role", "tg_username", "updated_at", "username") SELECT "banDuration", "banExpiresAt", "banReason", "bannedAt", "bannedBy", "created_at", "email", "id", "isActive", "isBanned", "lastLoginAt", "password", "role", "tg_username", "updated_at", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
