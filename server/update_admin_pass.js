const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
const bcrypt = require('bcryptjs'); 

async function run() { 
  const hash = await bcrypt.hash('admin123', 10); 
  await prisma.user.update({ where: { email: 'admin@matha.school' }, data: { passwordHash: hash }}); 
  console.log('Admin Password updated'); 
} 
run().finally(() => prisma.$disconnect());
