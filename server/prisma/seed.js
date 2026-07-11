require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...\n');

  const SALT_ROUNDS = 12;

  // ── Seed Users ────────────────────────────────────────────
  const usersToSeed = [
    {
      name: 'Admin User',
      email: 'admin@matha.school',
      password: 'Admin@1234',
      roles: ['Admin'],
    },
    {
      name: 'Class Teacher',
      email: 'classteacher@matha.school',
      password: 'Teacher@1234',
      roles: ['ClassTeacher'],
    },
    {
      name: 'Subject Teacher',
      email: 'subjectteacher@matha.school',
      password: 'Teacher@1234',
      roles: ['SubjectTeacher'],
    },
    {
      name: 'Dual Teacher',
      email: 'dualteacher@matha.school',
      password: 'Teacher@1234',
      roles: ['ClassTeacher', 'SubjectTeacher'], // dual-role teacher
    },
  ];

  for (const u of usersToSeed) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, roles: u.roles, name: u.name },
      create: { name: u.name, email: u.email, passwordHash, roles: u.roles },
    });
    console.log(`  ✅ ${user.roles.join(', ')} — ${user.name} <${user.email}>`);
  }

  console.log('\n🌱 Seed complete. Login credentials:');
  console.log('  admin@matha.school        / Admin@1234   (Admin)');
  console.log('  classteacher@matha.school / Teacher@1234 (ClassTeacher)');
  console.log('  subjectteacher@matha.school/ Teacher@1234 (SubjectTeacher)');
  console.log('  dualteacher@matha.school  / Teacher@1234 (ClassTeacher + SubjectTeacher)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
