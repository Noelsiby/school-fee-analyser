-- Report-card attendance typed in by the admin per exam (safe to run more than once)
CREATE TABLE IF NOT EXISTS "exam_attendance_days" (
    "examId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exam_attendance_days_pkey" PRIMARY KEY ("examId","classId")
);

CREATE TABLE IF NOT EXISTS "exam_attendance" (
    "examId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "present" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exam_attendance_pkey" PRIMARY KEY ("examId","studentId")
);

CREATE INDEX IF NOT EXISTS "exam_attendance_studentId_idx" ON "exam_attendance"("studentId");

DO $$ BEGIN
  ALTER TABLE "exam_attendance_days" ADD CONSTRAINT "exam_attendance_days_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "exam_attendance_days" ADD CONSTRAINT "exam_attendance_days_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "exam_attendance" ADD CONSTRAINT "exam_attendance_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "exam_attendance" ADD CONSTRAINT "exam_attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
