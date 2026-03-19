-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "socket_id" TEXT,
    "status" TEXT NOT NULL,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME,
    "parameters" TEXT,
    "error" TEXT,
    "localStorage_code" TEXT,
    "username" TEXT,
    "avatar_src" TEXT,
    "closed_by" TEXT,
    "disconnected_by" TEXT,
    "cleaned_up_by" TEXT,
    "driver_closed" BOOLEAN,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
