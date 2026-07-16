const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log('--- Verifying Class Counts ---');
  const classes = await prisma.class.findMany({
    include: {
      _count: {
        select: { students: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  for (const c of classes) {
    console.log(`${c.name} → ${c._count.students} students`);
  }

  console.log('\n--- Verifying First 3 Students of Class 1A ---');
  const class1A = await prisma.class.findFirst({ where: { name: 'Class 1A' } });
  if (class1A) {
    const students1A = await prisma.student.findMany({
      where: { classId: class1A.id },
      orderBy: { rollNumber: 'asc' },
      take: 3
    });
    console.log(`Class 1A first 3: ${students1A.map(s => s.name).join(', ')}`);
  }

  console.log('\n--- Verifying First 3 Students of Class 10 ---');
  const class10 = await prisma.class.findFirst({ where: { name: 'Class 10' } });
  if (class10) {
    const students10 = await prisma.student.findMany({
      where: { classId: class10.id },
      orderBy: { rollNumber: 'asc' },
      take: 3
    });
    console.log(`Class 10 first 3: ${students10.map(s => s.name).join(', ')}`);
  }
}

verify().catch(console.error).finally(() => prisma.$disconnect());
