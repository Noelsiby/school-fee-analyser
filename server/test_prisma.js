const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const teachers = await prisma.user.findMany({
      where: { roles: { hasSome: ['ClassTeacher', 'SubjectTeacher'] } },
      select: {
        id: true, name: true, email: true, profilePicUrl: true, createdAt: true,
        roles: true,
        teacherAssignments: {
          select: {
            id: true,
            subject: { select: { id: true, name: true } },
            class:   { select: { id: true, name: true } },
          },
        },
        classesTaught: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    console.log("Success!", teachers.length);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}
run();
