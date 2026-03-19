-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "saved_messages_export" TEXT;
ALTER TABLE "sessions" ADD COLUMN "saved_messages_exported_at" DATETIME;
