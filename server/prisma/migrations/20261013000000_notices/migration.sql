-- General WhatsApp notices to parents. Idempotent so it is safe to run twice.
CREATE TABLE IF NOT EXISTS "notices" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" JSONB NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "notice_messages" (
    "id" SERIAL NOT NULL,
    "noticeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "students" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notice_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notice_messages_noticeId_idx" ON "notice_messages"("noticeId");
CREATE INDEX IF NOT EXISTS "notice_messages_status_idx" ON "notice_messages"("status");

DO $$ BEGIN
    ALTER TABLE "notice_messages" ADD CONSTRAINT "notice_messages_noticeId_fkey"
        FOREIGN KEY ("noticeId") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
