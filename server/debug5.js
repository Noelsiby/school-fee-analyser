const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.examSubjectConfig.upsert({
    where: { id: 9999 }, // Just use create
    update: {},
    create: {
      examId: 10,
      subjectId: 4,
      maxMarks: 100
    }
  }).catch(() => prisma.examSubjectConfig.create({
    data: { examId: 10, subjectId: 4, maxMarks: 100 }
  }));

  // Ensure class 9 has students
  const cls = await prisma.class.findUnique({ where: { id: 9 }, include: { students: true } });
  if (cls.students.length === 0) {
      await prisma.student.createMany({
        data: [
          { name: `Test Student A`, rollNumber: '01', classId: 9 },
          { name: `Test Student B`, rollNumber: '02', classId: 9 }
        ]
      });
  }
  console.log('Added Subject Config for Subject 4 in Exam 10');
}
run().finally(() => prisma.$disconnect());
