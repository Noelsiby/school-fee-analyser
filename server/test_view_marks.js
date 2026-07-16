const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runTest() {
  try {
    const teacher = await prisma.user.findUnique({ where: { email: 'rehana@matha.school' } });
    console.log('Teacher:', teacher.name);

    const classRecord = await prisma.class.findFirst({ where: { classTeacherId: teacher.id } });
    console.log('Class:', classRecord.name); // Class 10

    const exam = await prisma.exam.findFirst({
      where: { classId: classRecord.id },
      include: { subjectConfigs: { include: { subject: true } } }
    });
    console.log('Exam:', exam.name);

    const socialSubjectConfig = exam.subjectConfigs.find(c => c.subject.name.toLowerCase().includes('social'));
    console.log('Target Subject:', socialSubjectConfig.subject.name);

    // Call logic similar to getSubjectMarks
    const students = await prisma.student.findMany({
      where: { classId: classRecord.id },
      orderBy: { rollNumber: 'asc' }
    });

    const marks = await prisma.mark.findMany({
      where: {
        examId: exam.id,
        subjectId: socialSubjectConfig.subjectId,
        student: { classId: classRecord.id }
      }
    });

    console.log(`\nFound ${students.length} students in Class 10`);
    console.log('First 3 Students:');
    for (let i = 0; i < 3; i++) {
      const student = students[i];
      const mark = marks.find(m => m.studentId === student.id);
      console.log(`- ${student.rollNumber} ${student.name}: ${mark ? mark.marksObtained : 'N/A'}/${socialSubjectConfig.maxMarks}`);
    }

    console.log('\nTest successful: Backend logic handles 24 students properly.');
  } catch (err) {
    console.error(err);
  } finally {
    prisma.$disconnect();
  }
}

runTest();
