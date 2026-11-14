-- Student app: parent accounts. Idempotent so it is safe to run twice.
-- CreateTable
CREATE TABLE IF NOT EXISTS "parent_accounts" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "pinHash" TEXT,
    "codeHash" TEXT,
    "codeExpires" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "inviteStatus" TEXT,
    "inviteError" TEXT,
    "activatedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "parent_accounts_phone_key" ON "parent_accounts"("phone");


