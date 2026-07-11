const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const classNames = [
    'LKG', 'UKG',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
  ];

  const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Rian', 'Diya', 'Myra', 'Aarohi', 'Ananya', 'Saanvi', 'Kavya', 'Riya', 'Aadhya', 'Sara', 'Navya'];
  const lastNames = ['Sharma', 'Kumar', 'Singh', 'Patel', 'Nair', 'Menon', 'Rao', 'Reddy', 'Das', 'Iyer', 'Gupta', 'Verma', 'Mishra', 'Pandey', 'Pillai'];

  function getRandomName() {
    const f = firstNames[Math.floor(Math.random() * firstNames.length)];
    const l = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${f} ${l}`;
  }

  const ct = await prisma.user.findUnique({ where: { email: 'classteacher@matha.school' } });
  if (!ct) throw new Error("Seed ClassTeacher not found!");

  for (const name of classNames) {
    console.log(`Processing ${name}...`);
    // Upsert class
    const cls = await prisma.class.upsert({
      where: { name },
      update: { classTeacherId: ct.id },
      create: { name, classTeacherId: ct.id }
    });

    // Generate 10 students for this class
    for (let i = 1; i <= 10; i++) {
      const rollNumber = i.toString();
      const studentName = getRandomName();
      
      // Check if student exists by rollNumber in this class
      await prisma.student.upsert({
        where: { rollNumber_classId: { rollNumber, classId: cls.id } },
        update: { name: studentName },
        create: {
          name: studentName,
          rollNumber,
          classId: cls.id
        }
      });
    }
    console.log(`✅ ${name}: Added 10 students.`);
  }

  console.log('\n🎉 Mock data generation complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
