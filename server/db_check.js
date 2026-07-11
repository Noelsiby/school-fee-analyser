const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, roles: true } });
  console.log('--- USERS ---', users);

  const classes = await prisma.class.findMany({ include: { classTeacher: true, subjects: true, students: true, teacherAssignments: true } });
  console.log('--- CLASSES ---', JSON.stringify(classes, null, 2));

  const exams = await prisma.exam.findMany({ include: { enrollments: true, subjectConfigs: true } });
  console.log('--- EXAMS ---', JSON.stringify(exams, null, 2));

  const notifs = await prisma.notification.findMany();
  console.log('--- NOTIFICATIONS ---', notifs);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
