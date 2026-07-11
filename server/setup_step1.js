const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- STEP 1: CLEANUP ---');
  // Find all classes
  const classes = await prisma.class.findMany({
    include: { students: true, subjects: true }
  });

  const emptyClassIds = classes
    .filter(c => c.students.length === 0 && c.subjects.length === 0 && !c.classTeacherId)
    .map(c => c.id);

  if (emptyClassIds.length > 0) {
    // Delete enrollments for these classes first
    await prisma.examClassEnrollment.deleteMany({ where: { classId: { in: emptyClassIds } } });
    await prisma.class.deleteMany({ where: { id: { in: emptyClassIds } } });
    console.log(`Deleted empty classes: ${emptyClassIds.join(', ')}`);
  }

  const remainingClasses = await prisma.$queryRawUnsafe(`SELECT id, name, "classTeacherId" FROM classes`);
  console.log('Remaining Classes:');
  console.table(remainingClasses);

  console.log('\\n--- STEP 2: SETUP SCENARIO ---');
  
  // Find or create "Class 9"
  let class9 = await prisma.class.findFirst({ where: { name: 'Class 9' } });
  if (!class9) {
    class9 = await prisma.class.create({ data: { name: 'Class 9' } });
  }

  // Assign Noel as Class Teacher
  const noelId = 13;
  await prisma.user.update({
    where: { id: noelId },
    data: { roles: ['ClassTeacher', 'SubjectTeacher'] } // Ensure roles
  });
  await prisma.class.update({
    where: { id: class9.id },
    data: { classTeacherId: noelId }
  });
  console.log('Set Noel as Class Teacher for Class 9.');

  // Create Students
  const existingStudents = await prisma.student.findMany({ where: { classId: class9.id } });
  if (existingStudents.length < 3) {
    const toCreate = 3 - existingStudents.length;
    for (let i = 0; i < toCreate; i++) {
      await prisma.student.create({
        data: { name: `Student ${i+1}`, rollNumber: `90${i+1}`, classId: class9.id }
      });
    }
    console.log('Created students for Class 9.');
  }

  // Create Subjects
  const subjectNames = ['Math', 'Science', 'English'];
  const subjects = [];
  for (const name of subjectNames) {
    let sub = await prisma.subject.findFirst({ where: { name, classId: class9.id } });
    if (!sub) {
      sub = await prisma.subject.create({ data: { name, classId: class9.id } });
    }
    subjects.push(sub);
  }
  console.log('Created subjects for Class 9.');

  // Assign Subject Teacher (id 7) to Science
  const stId = 7;
  const scienceSub = subjects.find(s => s.name === 'Science');
  let tsa1 = await prisma.teacherSubjectAssignment.findFirst({ where: { subjectId: scienceSub.id } });
  if (!tsa1) await prisma.teacherSubjectAssignment.create({ data: { teacherId: stId, subjectId: scienceSub.id, classId: class9.id } });
  else await prisma.teacherSubjectAssignment.update({ where: { id: tsa1.id }, data: { teacherId: stId }});

  // Assign Noel to Math
  const mathSub = subjects.find(s => s.name === 'Math');
  let tsa2 = await prisma.teacherSubjectAssignment.findFirst({ where: { subjectId: mathSub.id } });
  if (!tsa2) await prisma.teacherSubjectAssignment.create({ data: { teacherId: noelId, subjectId: mathSub.id, classId: class9.id } });
  else await prisma.teacherSubjectAssignment.update({ where: { id: tsa2.id }, data: { teacherId: noelId }});
  
  // English assignment
  const engSub = subjects.find(s => s.name === 'English');
  let tsa3 = await prisma.teacherSubjectAssignment.findFirst({ where: { subjectId: engSub.id } });
  if (!tsa3) await prisma.teacherSubjectAssignment.create({ data: { teacherId: stId, subjectId: engSub.id, classId: class9.id } });

  console.log('Assigned teachers to subjects.');

  // Create Open Exam
  let exam = await prisma.exam.findFirst({ where: { name: 'Term 1 Exam', classId: class9.id } });
  if (!exam) {
    exam = await prisma.exam.create({
      data: {
        name: 'Term 1 Exam',
        examType: 'CLASS_EXAM',
        status: 'Open',
        classId: class9.id,
        deadline: new Date('2026-12-31')
      }
    });
  } else {
    await prisma.exam.update({ where: { id: exam.id }, data: { status: 'Open' } });
  }

  // Configs
  for (const sub of subjects) {
    let conf = await prisma.examSubjectConfig.findFirst({ where: { examId: exam.id, subjectId: sub.id } });
    if (!conf) {
      await prisma.examSubjectConfig.create({
        data: { examId: exam.id, subjectId: sub.id, maxMarks: 100 }
      });
    }
  }
  
  console.log('Setup complete!');
}

run().finally(() => prisma.$disconnect());
