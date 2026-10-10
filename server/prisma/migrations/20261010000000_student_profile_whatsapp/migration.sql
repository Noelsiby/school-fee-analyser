-- Student profile (Bio Data), student photos, WhatsApp result messages.
-- Written to be safe to run more than once.

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "aadhaarNo"     TEXT,
  ADD COLUMN IF NOT EXISTS "address"       TEXT,
  ADD COLUMN IF NOT EXISTS "admissionDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "admissionNo"   TEXT,
  ADD COLUMN IF NOT EXISTS "apaarNo"       TEXT,
  ADD COLUMN IF NOT EXISTS "bloodGroup"    TEXT,
  ADD COLUMN IF NOT EXISTS "dateOfBirth"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fatherName"    TEXT,
  ADD COLUMN IF NOT EXISTS "idMark1"       TEXT,
  ADD COLUMN IF NOT EXISTS "idMark2"       TEXT,
  ADD COLUMN IF NOT EXISTS "parentPhone"   TEXT,
  ADD COLUMN IF NOT EXISTS "phoneRes"      TEXT,
  ADD COLUMN IF NOT EXISTS "section"       TEXT;

CREATE TABLE IF NOT EXISTS "student_photos" (
    "studentId" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "student_photos_pkey" PRIMARY KEY ("studentId")
);

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "whatsapp_messages_examId_studentId_idx" ON "whatsapp_messages"("examId", "studentId");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_status_idx" ON "whatsapp_messages"("status");

DO $$ BEGIN
  ALTER TABLE "student_photos" ADD CONSTRAINT "student_photos_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
