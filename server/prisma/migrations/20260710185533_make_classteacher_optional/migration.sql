-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_classTeacherId_fkey";

-- AlterTable
ALTER TABLE "classes" ALTER COLUMN "classTeacherId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_classTeacherId_fkey" FOREIGN KEY ("classTeacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
