-- Tuition (head of tuition's own area). Safe to run more than once.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TuitionHead';

ALTER TABLE "notices" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'school';

CREATE TABLE IF NOT EXISTS "tuition_classes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_classes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "tuition_teachers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "subjects" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_teachers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "tuition_teaching" (
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    CONSTRAINT "tuition_teaching_pkey" PRIMARY KEY ("teacherId","classId")
);
CREATE TABLE IF NOT EXISTS "tuition_students" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "feeOverride" DOUBLE PRECISION,
    "joinedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_students_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "tuition_payments" (
    "id" SERIAL NOT NULL,
    "tuitionStudentId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "mode" TEXT,
    "note" TEXT,
    "recordedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tuition_classes_name_key" ON "tuition_classes"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_students_studentId_key" ON "tuition_students"("studentId");
CREATE INDEX IF NOT EXISTS "tuition_students_classId_idx" ON "tuition_students"("classId");
CREATE INDEX IF NOT EXISTS "tuition_payments_month_idx" ON "tuition_payments"("month");
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_payments_tuitionStudentId_month_key" ON "tuition_payments"("tuitionStudentId", "month");

DO $$ BEGIN
  ALTER TABLE "tuition_teaching" ADD CONSTRAINT "tuition_teaching_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "tuition_teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tuition_teaching" ADD CONSTRAINT "tuition_teaching_classId_fkey" FOREIGN KEY ("classId") REFERENCES "tuition_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tuition_students" ADD CONSTRAINT "tuition_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tuition_students" ADD CONSTRAINT "tuition_students_classId_fkey" FOREIGN KEY ("classId") REFERENCES "tuition_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_tuitionStudentId_fkey" FOREIGN KEY ("tuitionStudentId") REFERENCES "tuition_students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
