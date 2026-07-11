const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- STEP 1 DB QUERIES ---');
  
  const classes = await prisma.$queryRawUnsafe(`SELECT id, name, "classTeacherId" FROM classes`);
  console.log('\\n1. CLASSES (SELECT id, name, "classTeacherId" FROM classes):');
  console.table(classes);

  const users = await prisma.$queryRawUnsafe(`SELECT id, name, email, roles FROM users WHERE roles::text ILIKE '%ClassTeacher%' OR roles::text ILIKE '%SubjectTeacher%'`);
  console.log('\\n2. USERS (SELECT id, name, email FROM users WHERE role IN...):');
  console.table(users);

  const tsas = await prisma.$queryRawUnsafe(`SELECT * FROM teacher_subject_assignments`);
  console.log('\\n3. TEACHER SUBJECT ASSIGNMENTS (SELECT * FROM teacher_subject_assignments):');
  console.table(tsas);

  const subjects = await prisma.$queryRawUnsafe(`SELECT id, name, "classId" FROM subjects`);
  console.log('\\n4. SUBJECTS (SELECT id, name, "classId" FROM subjects):');
  console.table(subjects);

  const students = await prisma.$queryRawUnsafe(`SELECT id, name, "classId" FROM students LIMIT 20`);
  console.log('\\n5. STUDENTS (SELECT id, name, "classId" FROM students LIMIT 20):');
  console.table(students);

  const exams = await prisma.$queryRawUnsafe(`SELECT id, name, status, "classId" FROM exams WHERE status = 'Open'`);
  console.log(`\\n6. OPEN EXAMS (SELECT id, name, status, "classId" FROM exams WHERE status = 'Open'):`);
  console.table(exams);

  const configs = await prisma.$queryRawUnsafe(`SELECT * FROM exam_subject_configs`);
  console.log('\\n7. EXAM SUBJECT CONFIGS (SELECT * FROM exam_subject_configs):');
  console.table(configs);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
