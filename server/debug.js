const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const c = await prisma.class.count({ where: { classTeacherId: null }});
  console.log('Null class teachers:', c);
}
run();
