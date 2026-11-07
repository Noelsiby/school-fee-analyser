-- Performance analyser, attendance, timetable and substitutions. Idempotent so it is safe to run twice.
-- CreateTable
CREATE TABLE IF NOT EXISTS "result_snapshots" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "examId" INTEGER NOT NULL,
    "examName" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "classId" INTEGER NOT NULL,
    "className" TEXT NOT NULL,
    "subjects" JSONB NOT NULL,
    "total" DOUBLE PRECISION,
    "maxTotal" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "grade" TEXT,
    "gpa" DOUBLE PRECISION,
    "rank" INTEGER,
    "rankedCount" INTEGER NOT NULL DEFAULT 0,
    "classAverage" DOUBLE PRECISION,
    "classHighest" DOUBLE PRECISION,
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "student_notes" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "subject" TEXT,
    "text" TEXT NOT NULL,
    "authorId" INTEGER,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "remedial_groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "classId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "studentIds" INTEGER[],
    "baseline" JSONB NOT NULL,
    "baseExamId" INTEGER,
    "note" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remedial_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "markedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "holidays" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "attendance_alerts" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "timetable_entries" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "subjectId" INTEGER,
    "teacherId" INTEGER,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "substitutions" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "classId" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "absentTeacherId" INTEGER,
    "substituteId" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "result_snapshots_examId_idx" ON "result_snapshots"("examId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "result_snapshots_classId_idx" ON "result_snapshots"("classId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "result_snapshots_studentId_examId_key" ON "result_snapshots"("studentId", "examId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "student_notes_studentId_idx" ON "student_notes"("studentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "remedial_groups_classId_idx" ON "remedial_groups"("classId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "attendance_records_classId_date_idx" ON "attendance_records"("classId", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_studentId_date_slot_key" ON "attendance_records"("studentId", "date", "slot");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "attendance_alerts_studentId_date_idx" ON "attendance_alerts"("studentId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "timetable_entries_teacherId_day_idx" ON "timetable_entries"("teacherId", "day");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "timetable_entries_classId_day_periodKey_key" ON "timetable_entries"("classId", "day", "periodKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "substitutions_substituteId_date_idx" ON "substitutions"("substituteId", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "substitutions_date_classId_periodKey_key" ON "substitutions"("date", "classId", "periodKey");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "result_snapshots" ADD CONSTRAINT "result_snapshots_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "attendance_alerts" ADD CONSTRAINT "attendance_alerts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


