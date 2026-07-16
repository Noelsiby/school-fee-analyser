const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.class.findFirst({ where: { name: '1' } });
  if (c) {
    // Delete any dependent records first
    await prisma.student.deleteMany({ where: { classId: c.id } });
    await prisma.teacherSubjectAssignment.deleteMany({ where: { classId: c.id } });
    await prisma.examClassEnrollment.deleteMany({ where: { classId: c.id } });
    await prisma.subject.deleteMany({ where: { classId: c.id } });
    await prisma.exam.deleteMany({ where: { classId: c.id } });

    // Delete the class
    await prisma.class.delete({ where: { id: c.id } });
    console.log('Successfully deleted the class named "1" and all its dependencies.');
  } else {
    console.log('Class "1" not found.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
