const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.mark.deleteMany({});
  await prisma.examSubjectConfig.deleteMany({});
  await prisma.examClassEnrollment?.deleteMany({});
  await prisma.exam.deleteMany({});
  console.log('Deleted all exams and related data.');
}
main().catch(console.error).finally(() => prisma.$disconnect());
