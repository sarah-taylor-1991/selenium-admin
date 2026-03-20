-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserRank" AS ENUM ('ROOKIE', 'RUNNER', 'HUSTLER', 'THUG', 'ENFORCER', 'UNDERBOSS', 'OVERLORD', 'BOSS', 'GODFATHER', 'SHADOWMASTER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "tg_username" TEXT,
    "tg_id" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "rank" "UserRank" NOT NULL DEFAULT 'ROOKIE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lastLoginAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banDuration" TEXT,
    "banExpiresAt" TIMESTAMP(3),
    "bannedAt" TIMESTAMP(3),
    "bannedBy" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "socket_id" TEXT,
    "device_hash" TEXT,
    "user_id" TEXT,
    "status" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
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
    "chat_list_collected_at" TIMESTAMP(3),
    "saved_messages_export" TEXT,
    "saved_messages_exported_at" TIMESTAMP(3),
    "chat_exports" TEXT,
    "chat_exports_collected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_tg_id_key" ON "users"("tg_id");
CREATE UNIQUE INDEX "user_sessions_token_key" ON "user_sessions"("token");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
