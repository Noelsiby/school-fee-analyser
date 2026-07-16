const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const classTeachersData = [
  { name: 'Mrs. Jhansi', email: 'jhansi@matha.school', className: 'Class 1A' },
  { name: 'Ms. Naga Mani', email: 'nagamani@matha.school', className: 'Class 2A' },
  { name: 'Ms. Lalitha', email: 'lalitha@matha.school', className: 'Class 3A' },
  { name: 'Mrs. Naga Lakshmi', email: 'nagalakshmi@matha.school', className: 'Class 3B' },
  { name: 'Mr. Praveen', email: 'praveen@matha.school', className: 'Class 4' },
  { name: 'Mrs. Remyamol E.R', email: 'remyamol@matha.school', className: 'Class 5' },
  { name: 'Mrs. Suma Latha', email: 'sumalatha@matha.school', className: 'Class 6' },
  { name: 'Mr. Naga Raju', email: 'nagaraju@matha.school', className: 'Class 7' },
  { name: 'Ms. Sree Resmi', email: 'sreeresmi@matha.school', className: 'Class 8' },
  { name: 'Mr. Kalidas', email: 'kalidas@matha.school', className: 'Class 9' },
  { name: 'Mrs. Rehana', email: 'rehana@matha.school', className: 'Class 10' }
];

const subjectTeachersData = [
  { name: 'Mrs. Rama Devi', email: 'ramadevi@matha.school' },
  { name: 'Mrs. Sharmila', email: 'sharmila@matha.school' },
  { name: 'Mrs. Deepa Kurian', email: 'deepa@matha.school' }
];

async function main() {
  console.log('🚀 Starting teacher seed...');
  const passwordHash = await bcrypt.hash('teacher@1234', 12);

  // 1. Process Class Teachers
  for (const t of classTeachersData) {
    let user = await prisma.user.findUnique({ where: { email: t.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: t.name,
          email: t.email,
          passwordHash,
          roles: ['ClassTeacher']
        }
      });
      console.log(`✅ Created ClassTeacher: ${t.name} (${t.email})`);
    } else {
      console.log(`⏭️  User already exists: ${t.email}`);
      // Ensure they have the role
      if (!user.roles.includes('ClassTeacher')) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { roles: { push: 'ClassTeacher' } }
        });
      }
    }

    // Assign to Class
    const cls = await prisma.class.findUnique({ where: { name: t.className } });
    if (cls) {
      await prisma.class.update({
        where: { id: cls.id },
        data: { classTeacherId: user.id }
      });
      console.log(`   → Assigned ${t.name} to ${t.className}`);
    } else {
      console.log(`   ❌ Class not found: ${t.className}`);
    }
  }

  // 2. Process Subject Teachers
  for (const t of subjectTeachersData) {
    let user = await prisma.user.findUnique({ where: { email: t.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: t.name,
          email: t.email,
          passwordHash,
          roles: ['SubjectTeacher']
        }
      });
      console.log(`✅ Created SubjectTeacher: ${t.name} (${t.email})`);
    } else {
      console.log(`⏭️  User already exists: ${t.email}`);
    }
  }

  console.log('\\n--- Verification Query ---');
  // Emulating the SQL query using Prisma relations for clean output
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { roles: { has: 'ClassTeacher' } },
        { roles: { has: 'SubjectTeacher' } }
      ]
    },
    include: {
      classesManaged: true
    },
    orderBy: { id: 'asc' }
  });

  console.table(
    users.map(u => ({
      name: u.name,
      email: u.email,
      assigned_class: u.classesManaged && u.classesManaged.length > 0 ? u.classesManaged[0].name : 'NULL'
    }))
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
