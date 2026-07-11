const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const noelId = 13;

  // 1. Give noel ClassTeacher and SubjectTeacher roles
  await prisma.user.update({
    where: { id: noelId },
    data: { roles: ['ClassTeacher', 'SubjectTeacher'] }
  });
  console.log('Updated Noel roles.');

  // 2. Make Noel Class Teacher of Class 1 (which is enrolled in Open Exam 9)
  await prisma.class.update({
    where: { id: 1 },
    data: { classTeacherId: noelId }
  });
  console.log('Made Noel Class Teacher of Class 1.');

  // 3. Make Noel Subject Teacher of Subject 4 (maths for Class 1)
  const existingTSA = await prisma.teacherSubjectAssignment.findFirst({
    where: { subjectId: 4 }
  });
  if (existingTSA) {
    await prisma.teacherSubjectAssignment.update({
      where: { id: existingTSA.id },
      data: { teacherId: noelId }
    });
  } else {
    await prisma.teacherSubjectAssignment.create({
      data: { teacherId: noelId, subjectId: 4, classId: 1 }
    });
  }
  console.log('Assigned Noel to Subject 4 (maths in Class 1).');

  // 4. Ensure Class 1 has students
  const class1 = await prisma.class.findUnique({ where: { id: 1 }, include: { students: true } });
  if (class1.students.length === 0) {
    await prisma.student.createMany({
      data: [
        { name: `Noel's Student A`, rollNumber: 'N1', classId: 1 },
        { name: `Noel's Student B`, rollNumber: 'N2', classId: 1 }
      ]
    });
    console.log('Added students to Class 1.');
  } else {
    console.log('Class 1 already has students.');
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
