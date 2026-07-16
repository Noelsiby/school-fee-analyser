const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function wipeDatabase() {
  console.log('Starting full database wipe for production...');

  // Delete all operational data in reverse dependency order
  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.mark.deleteMany({});
  await prisma.examSubjectConfig.deleteMany({});
  await prisma.examClassEnrollment.deleteMany({});
  await prisma.exam.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.teacherSubjectAssignment.deleteMany({});
  await prisma.subject.deleteMany({});
  await prisma.class.deleteMany({});
  
  // Delete all users
  await prisma.user.deleteMany({});
  
  console.log('All previous data deleted.');

  // Create fresh Admin user so the client can log in
  const passwordHash = await bcrypt.hash('Admin@1234', 12);
  const admin = await prisma.user.create({
    data: {
      name: 'System Admin',
      email: 'admin@matha.school',
      passwordHash,
      roles: ['Admin']
    }
  });

  console.log('✅ Fresh database ready.');
  console.log('Client Login Credentials:');
  console.log(`Email: ${admin.email}`);
  console.log(`Password: Admin@1234`);
}

wipeDatabase()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
