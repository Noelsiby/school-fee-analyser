const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const classes = await prisma.class.findMany();
  const subjects = await prisma.subject.findMany();
  const exams = await prisma.exam.findMany();
  console.log("Classes:", classes);
  console.log("Subjects:", subjects);
  console.log("Exams:", exams);
}

main().catch(console.error).finally(() => prisma.$disconnect());
