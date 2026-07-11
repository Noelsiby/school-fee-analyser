const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const cls = await prisma.class.findUnique({ where: { id: 9 }, include: { subjects: true } });
  console.log(cls.subjects);
}
run();
