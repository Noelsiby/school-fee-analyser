const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // Clear old exam configs for exam 10
  await prisma.examSubjectConfig.deleteMany({ where: { examId: 10 } });
  await prisma.mark.deleteMany({ where: { examId: 10 } });

  // Create Subject for Class 9
  const sub = await prisma.subject.create({
    data: { name: 'Science', classId: 9 }
  });

  // Assign Subject Teacher (7) to this subject
  await prisma.teacherSubjectAssignment.create({
    data: { teacherId: 7, subjectId: sub.id, classId: 9 }
  });

  // Configure Exam 10 with this subject
  await prisma.examSubjectConfig.create({
    data: { examId: 10, subjectId: sub.id, maxMarks: 100 }
  });

  console.log('Fixed data. Run e2e_test.js again.');
}

run().finally(() => prisma.$disconnect());
