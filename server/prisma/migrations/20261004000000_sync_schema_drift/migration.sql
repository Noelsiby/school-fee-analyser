-- Brings the migration history in line with schema.prisma.
-- These columns already exist on the production database (they were added
-- outside of migrations), so every statement is written to be a no-op there.

DO $$ BEGIN
  CREATE TYPE "EnrollmentStatus" AS ENUM ('Pending', 'InProgress', 'Finalized');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "exam_class_enrollments"
  ADD COLUMN IF NOT EXISTS "status" "EnrollmentStatus" NOT NULL DEFAULT 'Pending';

ALTER TABLE "exams"
  ADD COLUMN IF NOT EXISTS "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The default above only exists so the column can be added to a table that
-- already has rows; Prisma manages updatedAt itself.
ALTER TABLE "exams" ALTER COLUMN "updatedAt" DROP DEFAULT;
