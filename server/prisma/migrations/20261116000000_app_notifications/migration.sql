-- Student app notifications; results released to families. Idempotent so it is safe to run twice.
-- AlterTable
ALTER TABLE "result_snapshots" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMP(3);

-- Results of the exam that is published right now are already visible to families
UPDATE "result_snapshots" SET "releasedAt" = NOW()
WHERE "releasedAt" IS NULL AND "examId" IN (SELECT "id" FROM "exams" WHERE "isPublished" = true);

-- CreateTable
CREATE TABLE IF NOT EXISTS "push_tokens" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "parent_notifications" (
    "id" SERIAL NOT NULL,
    "parentId" INTEGER NOT NULL,
    "studentId" INTEGER,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "push_tokens_parentId_idx" ON "push_tokens"("parentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "parent_notifications_parentId_createdAt_idx" ON "parent_notifications"("parentId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "parent_notifications" ADD CONSTRAINT "parent_notifications_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


