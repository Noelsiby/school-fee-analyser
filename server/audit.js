const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- 1. CLASSES ---');
  const classes = await prisma.class.findMany({ select: { id: true, name: true, classTeacherId: true } });
  console.table(classes);

  console.log('--- 2. USERS ---');
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, roles: true } });
  console.table(users);

  console.log('--- 3. TEACHER_SUBJECT_ASSIGNMENTS ---');
  const tsa = await prisma.teacherSubjectAssignment.findMany();
  console.table(tsa);

  console.log('--- 4. SUBJECTS ---');
  const subjects = await prisma.subject.findMany({ select: { id: true, name: true, classId: true } });
  console.table(subjects);

  console.log('--- 5. STUDENTS ---');
  const students = await prisma.student.findMany({ select: { id: true, name: true, classId: true } });
  console.table(students);

  console.log('--- 6. EXAMS ---');
  const exams = await prisma.exam.findMany({ select: { id: true, name: true, status: true, classId: true, examType: true } });
  console.table(exams);

  console.log('--- 7. EXAM_SUBJECT_CONFIGS ---');
  const configs = await prisma.examSubjectConfig.findMany();
  console.table(configs);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
