const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAssignments() {
  try {
    const class9 = await prisma.class.findFirst({ where: { name: 'Class 9' } });
    const class10 = await prisma.class.findFirst({ where: { name: 'Class 10' } });

    const rehana = await prisma.user.findUnique({ where: { email: 'rehana@matha.school' } });
    const kalidas = await prisma.user.findUnique({ where: { email: 'kalidas@matha.school' } });
    const deepa = await prisma.user.findFirst({ where: { name: 'Mrs. Deepa Kurian' } });
    const anyTeacher = await prisma.user.findFirst({ where: { roles: { has: 'SubjectTeacher' } } });

    async function assignTeacher(classId, subjectName, teacherId) {
      const subject = await prisma.subject.findFirst({ where: { classId, name: subjectName } });
      if (subject) {
        await prisma.teacherSubjectAssignment.deleteMany({ where: { classId, subjectId: subject.id } });
        await prisma.teacherSubjectAssignment.create({ data: { classId, subjectId: subject.id, teacherId } });
      }
    }

    if (class10) {
      if (rehana) await assignTeacher(class10.id, 'Hindi', rehana.id);
      await assignTeacher(class10.id, 'Social', deepa ? deepa.id : anyTeacher.id);
    }

    if (class9) {
      if (kalidas) await assignTeacher(class9.id, 'Hindi', kalidas.id);
      await assignTeacher(class9.id, 'Social', deepa ? deepa.id : anyTeacher.id);
    }

    console.log('Fixed subject assignments for Class 9 and Class 10.');

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

fixAssignments();
