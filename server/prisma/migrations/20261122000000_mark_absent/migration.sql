-- Exam marks: student absent ("AB"). Safe to run more than once.
ALTER TABLE "marks" ADD COLUMN IF NOT EXISTS "isAbsent" BOOLEAN NOT NULL DEFAULT false;
