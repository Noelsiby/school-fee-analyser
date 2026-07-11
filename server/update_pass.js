const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
const bcrypt = require('bcryptjs'); 

async function run() { 
  const hash = await bcrypt.hash('password123', 10); 
  await prisma.user.update({ where: { email: 'noel@matha.school' }, data: { passwordHash: hash }}); 
  console.log('Password updated'); 
} 
run().finally(() => prisma.$disconnect());
