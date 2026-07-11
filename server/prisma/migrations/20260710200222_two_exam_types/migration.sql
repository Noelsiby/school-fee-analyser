/*
  Warnings:

  - You are about to drop the column `createdAt` on the `exams` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('CLASS_EXAM', 'INTERNAL_EXAM');

-- DropForeignKey
ALTER TABLE "exams" DROP CONSTRAINT "exams_classId_fkey";

-- DropIndex
DROP INDEX "exams_classId_idx";

-- AlterTable
ALTER TABLE "exams" DROP COLUMN "createdAt",
ADD COLUMN     "examType" "ExamType" NOT NULL DEFAULT 'CLASS_EXAM',
ALTER COLUMN "classId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "exam_class_enrollments" (
    "examId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exam_class_enrollments_pkey" PRIMARY KEY ("examId","classId")
);

-- AddForeignKey
ALTER TABLE "exam_class_enrollments" ADD CONSTRAINT "exam_class_enrollments_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_class_enrollments" ADD CONSTRAINT "exam_class_enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
