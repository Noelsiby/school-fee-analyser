const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function run() {
  console.log('--- PHASE 2: Fresh Data Seed ---');

  // 1. Create Teachers
  console.log('Creating Teachers...');
  const maryPass = await bcrypt.hash('Mary@5678', 10);
  const rajanPass = await bcrypt.hash('Rajan@5678', 10);
  const anithaPass = await bcrypt.hash('Anitha@5678', 10);

  const mary = await prisma.user.upsert({
    where: { email: 'mary@matha.school' },
    update: { passwordHash: maryPass, roles: ['ClassTeacher', 'SubjectTeacher'] },
    create: { name: 'Mary Joseph', email: 'mary@matha.school', passwordHash: maryPass, roles: ['ClassTeacher', 'SubjectTeacher'] }
  });

  const rajan = await prisma.user.upsert({
    where: { email: 'rajan@matha.school' },
    update: { passwordHash: rajanPass, roles: ['SubjectTeacher'] },
    create: { name: 'Rajan Nair', email: 'rajan@matha.school', passwordHash: rajanPass, roles: ['SubjectTeacher'] }
  });

  const anitha = await prisma.user.upsert({
    where: { email: 'anitha@matha.school' },
    update: { passwordHash: anithaPass, roles: ['SubjectTeacher'] },
    create: { name: 'Anitha Krishnan', email: 'anitha@matha.school', passwordHash: anithaPass, roles: ['SubjectTeacher'] }
  });

  // 2. Create Class 8A
  console.log('Creating Class 8A...');
  const class8A = await prisma.class.upsert({
    where: { name: 'Class 8A' },
    update: { classTeacherId: mary.id },
    create: { name: 'Class 8A', classTeacherId: mary.id }
  });

  // 3. Create Students
  console.log('Creating Students...');
  const studentsData = [
    { name: 'John Thomas', rollNumber: '001' },
    { name: 'Priya Nair', rollNumber: '002' },
    { name: 'Arjun Menon', rollNumber: '003' },
    { name: 'Sneha Pillai', rollNumber: '004' },
    { name: 'Rahul Kumar', rollNumber: '005' }
  ];

  for (const s of studentsData) {
    const existing = await prisma.student.findFirst({ where: { rollNumber: s.rollNumber, classId: class8A.id } });
    if (!existing) {
      await prisma.student.create({ data: { ...s, classId: class8A.id } });
    }
  }

  // 4. Create Subjects & Assignments
  console.log('Creating Subjects and Assignments...');
  const math = await prisma.subject.upsert({
    where: { name_classId: { name: 'Mathematics', classId: class8A.id } },
    update: {}, create: { name: 'Mathematics', classId: class8A.id }
  });
  const science = await prisma.subject.upsert({
    where: { name_classId: { name: 'Science', classId: class8A.id } },
    update: {}, create: { name: 'Science', classId: class8A.id }
  });
  const english = await prisma.subject.upsert({
    where: { name_classId: { name: 'English', classId: class8A.id } },
    update: {}, create: { name: 'English', classId: class8A.id }
  });

  // Assign teachers
  const assign = async (teacherId, subjectId) => {
    const exist = await prisma.teacherSubjectAssignment.findFirst({ where: { teacherId, subjectId, classId: class8A.id } });
    if (!exist) {
      await prisma.teacherSubjectAssignment.create({ data: { teacherId, subjectId, classId: class8A.id } });
    }
  };
  await assign(rajan.id, math.id);
  await assign(anitha.id, science.id);
  await assign(mary.id, english.id);

  // 5. Create Exam
  console.log('Creating Exam...');
  let exam = await prisma.exam.findFirst({ where: { name: 'First Term Examination', classId: class8A.id } });
  
  if (!exam) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14); // 2 weeks
    exam = await prisma.exam.create({
      data: {
        name: 'First Term Examination',
        examType: 'CLASS_EXAM',
        classId: class8A.id,
        deadline,
        status: 'Open'
      }
    });
  } else {
    exam = await prisma.exam.update({
      where: { id: exam.id },
      data: { status: 'Open' }
    });
  }

  // Configure Max Marks
  for (const subId of [math.id, science.id, english.id]) {
    await prisma.examSubjectConfig.upsert({
      where: { examId_subjectId: { examId: exam.id, subjectId: subId } },
      update: { maxMarks: 100 },
      create: { examId: exam.id, subjectId: subId, maxMarks: 100 }
    });
  }

  console.log('✅ Phase 2 Fresh Data Seed Complete!');
}

run().finally(() => prisma.$disconnect());
