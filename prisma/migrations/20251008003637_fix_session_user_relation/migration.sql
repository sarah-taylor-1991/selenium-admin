/*
  Warnings:

  - You are about to drop the column `uid` on the `sessions` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "socket_id" TEXT,
    "device_hash" TEXT,
    "user_id" TEXT,
    "status" TEXT NOT NULL,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME,
    "parameters" TEXT,
    "error" TEXT,
    "localStorage_code" TEXT,
    "username" TEXT,
    "avatar_src" TEXT,
    "phone_number" TEXT,
    "secret_question_answer" TEXT,
    "closed_by" TEXT,
    "disconnected_by" TEXT,
    "cleaned_up_by" TEXT,
    "driver_closed" BOOLEAN,
    "chat_list" TEXT,
    "chat_list_collected_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_sessions" ("avatar_src", "chat_list", "chat_list_collected_at", "cleaned_up_by", "closed_by", "created_at", "device_hash", "disconnected_by", "driver_closed", "end_time", "error", "id", "localStorage_code", "parameters", "phone_number", "secret_question_answer", "socket_id", "start_time", "status", "updated_at", "username") SELECT "avatar_src", "chat_list", "chat_list_collected_at", "cleaned_up_by", "closed_by", "created_at", "device_hash", "disconnected_by", "driver_closed", "end_time", "error", "id", "localStorage_code", "parameters", "phone_number", "secret_question_answer", "socket_id", "start_time", "status", "updated_at", "username" FROM "sessions";
DROP TABLE "sessions";
ALTER TABLE "new_sessions" RENAME TO "sessions";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
