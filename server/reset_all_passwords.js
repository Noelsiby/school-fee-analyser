const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function run() {
  console.log('--- 1. CURRENT ADMIN HASH ---');
  const admin = await prisma.user.findUnique({ where: { email: 'admin@matha.school' }});
  console.log(`admin@matha.school current hash: ${admin?.passwordHash}`);

  console.log('\\n--- 2. RESETTING PASSWORDS ---');
  // Define standard passwords
  const passwords = {
    'admin@matha.school': 'Admin@1234',
    'noel@matha.school': 'password123',
    'default': 'password123'
  };

  const users = await prisma.user.findMany({ select: { id: true, email: true, roles: true }});
  
  const credentials = [];

  for (const user of users) {
    const plainText = passwords[user.email] || passwords.default;
    const hash = await bcrypt.hash(plainText, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash }
    });
    credentials.push({
      email: user.email,
      roles: user.roles.join(', '),
      password: plainText
    });
  }
  
  console.log('Passwords reset successfully.');

  console.log('\\n--- 3. COMPLETE CREDENTIALS LIST ---');
  console.table(credentials);
}

run().catch(console.error).finally(() => prisma.$disconnect());
