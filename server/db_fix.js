const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- DB FIX SCRIPT ---');

  // 1. Assign classTeacherId to any Class missing it
  const classTeacher = await prisma.user.findFirst({
    where: { roles: { has: 'ClassTeacher' } }
  });
  if (classTeacher) {
    const updatedClasses = await prisma.class.updateMany({
      where: { classTeacherId: null },
      data: { classTeacherId: classTeacher.id }
    });
    console.log(`Assigned ClassTeacher (ID: ${classTeacher.id}) to ${updatedClasses.count} classes.`);
  }

  // 2. Assign TeacherSubjectAssignment to any Subject missing it
  const subjectTeacher = await prisma.user.findFirst({
    where: { roles: { has: 'SubjectTeacher' } }
  });
  if (subjectTeacher) {
    const subjects = await prisma.subject.findMany({
      include: { teacherAssignments: true }
    });
    let tsacount = 0;
    for (const sub of subjects) {
      if (sub.teacherAssignments.length === 0) {
        await prisma.teacherSubjectAssignment.create({
          data: {
            subjectId: sub.id,
            teacherId: subjectTeacher.id,
            classId: sub.classId
          }
        });
        tsacount++;
      }
    }
    console.log(`Created ${tsacount} missing TeacherSubjectAssignments for SubjectTeacher (ID: ${subjectTeacher.id}).`);
  }

  // 3. Generate students for any Class missing students
  const classes = await prisma.class.findMany({ include: { students: true } });
  let studentCount = 0;
  for (const cls of classes) {
    if (cls.students.length === 0) {
      await prisma.student.createMany({
        data: [
          { name: `Test Student 1`, rollNumber: '01', classId: cls.id },
          { name: `Test Student 2`, rollNumber: '02', classId: cls.id },
          { name: `Test Student 3`, rollNumber: '03', classId: cls.id }
        ]
      });
      studentCount += 3;
    }
  }
  console.log(`Created ${studentCount} missing students.`);

  // 4. Generate ExamSubjectConfig for published exams missing configs
  const exams = await prisma.exam.findMany({
    where: { status: { in: ['Open', 'Closed'] } },
    include: { subjectConfigs: true, enrollments: true }
  });
  let configCount = 0;
  for (const ex of exams) {
    if (ex.subjectConfigs.length === 0) {
      // Find subjects for this exam's classes
      const classIds = [];
      if (ex.classId) classIds.push(ex.classId);
      if (ex.enrollments && ex.enrollments.length > 0) {
        ex.enrollments.forEach(e => classIds.push(e.classId));
      }

      if (classIds.length > 0) {
        const subjects = await prisma.subject.findMany({
          where: { classId: { in: classIds } }
        });
        for (const sub of subjects) {
          await prisma.examSubjectConfig.create({
            data: {
              examId: ex.id,
              subjectId: sub.id,
              maxMarks: 100
            }
          });
          configCount++;
        }
      }
    }
  }
  console.log(`Created ${configCount} missing ExamSubjectConfigs.`);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    console.log('DB Fix complete.');
  });
