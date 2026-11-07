-- AI assistant usage (tokens and estimated cost per question). Idempotent so it is safe to run twice.
CREATE TABLE IF NOT EXISTS "assistant_usage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "question" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "assistant_usage_createdAt_idx" ON "assistant_usage"("createdAt");
