-- Tuition teacher salaries. Safe to run more than once.
ALTER TABLE "tuition_teachers" ADD COLUMN IF NOT EXISTS "monthlySalary" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "tuition_salaries" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "mode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_salaries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_salaries_teacherId_month_key" ON "tuition_salaries"("teacherId", "month");
DO $$ BEGIN
  ALTER TABLE "tuition_salaries" ADD CONSTRAINT "tuition_salaries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "tuition_teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tuition teacher picked from the school's teachers (null = outside teacher)
ALTER TABLE "tuition_teachers" ADD COLUMN IF NOT EXISTS "schoolUserId" INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_teachers_schoolUserId_key" ON "tuition_teachers"("schoolUserId");
