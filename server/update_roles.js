const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const classTeacherEmails = [
  'jhansi@matha.school',
  'nagamani@matha.school',
  'lalitha@matha.school',
  'nagalakshmi@matha.school',
  'praveen@matha.school',
  'remyamol@matha.school',
  'sumalatha@matha.school',
  'nagaraju@matha.school',
  'sreeresmi@matha.school',
  'kalidas@matha.school',
  'rehana@matha.school'
];

async function main() {
  console.log('--- Updating Roles for Class Teachers ---');
  for (const email of classTeacherEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const roles = new Set(user.roles);
      roles.add('ClassTeacher');
      roles.add('SubjectTeacher'); // Add SubjectTeacher role
      
      await prisma.user.update({
        where: { id: user.id },
        data: { roles: Array.from(roles) }
      });
      console.log(`Updated ${user.name} (${email}) -> ${Array.from(roles).join(', ')}`);
    } else {
      console.log(`User not found: ${email}`);
    }
  }
  
  console.log('\n--- Verifying All 14 Teachers ---');
  const teachers = await prisma.user.findMany({
    where: {
      email: {
        in: [
          ...classTeacherEmails,
          'ramadevi@matha.school',
          'sharmila@matha.school',
          'deepa@matha.school'
        ]
      }
    },
    orderBy: { id: 'asc' }
  });

  console.table(teachers.map(t => ({
    name: t.name,
    email: t.email,
    roles: t.roles.join(', ')
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
