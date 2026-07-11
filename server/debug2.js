const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const teacherId = 3;
  const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId },
      select: { classId: true, subjectId: true }
  });
  console.log('Assignments:', assignments);
  const classIds = [...new Set(assignments.map(a => a.classId))];
  console.log('Class IDs:', classIds);
  
  const exams = await prisma.exam.findMany({
      where: {
        OR: [
          { classId: { in: classIds } },
          { enrollments: { some: { classId: { in: classIds } } } }
        ],
        status: { in: ['Open', 'Closed'] } 
      },
      include: { enrollments: true }
  });
  console.log('Exams found:', exams);
}
run().finally(() => prisma.$disconnect());
