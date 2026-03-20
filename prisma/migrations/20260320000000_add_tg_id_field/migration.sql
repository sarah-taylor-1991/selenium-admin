-- Add tg_id column to users table for Telegram bot UID linking
ALTER TABLE "users" ADD COLUMN "tg_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_tg_id_key" ON "users"("tg_id");
