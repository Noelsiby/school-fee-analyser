const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // Find subject teacher
  const teacher = await prisma.user.findUnique({ where: { email: 'subjectteacher@matha.school' } });
  
  // Assign them to Subject ID 4 (English, Class 9)
  const existingTSA = await prisma.teacherSubjectAssignment.findFirst({
    where: { teacherId: teacher.id, subjectId: 4 }
  });
  if (!existingTSA) {
    await prisma.teacherSubjectAssignment.create({ data: { teacherId: teacher.id, subjectId: 4, classId: 9 } });
  }

  // Assign Class Teacher to Class 9
  const ct = await prisma.user.findUnique({ where: { email: 'classteacher@matha.school' } });
  await prisma.class.update({
    where: { id: 9 },
    data: { classTeacherId: ct.id }
  });

  // Enroll Class 9 in Exam 10
  const existingEnrollment = await prisma.examClassEnrollment.findFirst({
    where: { examId: 10, classId: 9 }
  });
  if (!existingEnrollment) {
    await prisma.examClassEnrollment.create({ data: { examId: 10, classId: 9 } });
  }

  console.log('Test data primed.');
}

run().finally(() => prisma.$disconnect());
