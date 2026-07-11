const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const teacher = await prisma.user.findUnique({ where: { id: 7 } });
  const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: 7 },
      select: { classId: true, subjectId: true }
  });
  console.log('Assignments for ID 7:', assignments);
  const exams = await prisma.exam.findMany({
    include: { enrollments: true, subjectConfigs: true }
  });
  console.log('Exams:', JSON.stringify(exams, null, 2));
}
run();
