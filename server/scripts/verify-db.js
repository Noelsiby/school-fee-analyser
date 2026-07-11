require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== TABLES IN DATABASE ===');
  const tables = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  tables.forEach((t, i) => console.log(`  ${i + 1}. ${t.tablename}`));

  console.log('\n=== LIVE QUERY TEST: ROW COUNTS ===');
  const counts = await Promise.all([
    prisma.user.count().then(n => `  users:                        ${n} rows`),
    prisma.class.count().then(n => `  classes:                      ${n} rows`),
    prisma.subject.count().then(n => `  subjects:                     ${n} rows`),
    prisma.teacherSubjectAssignment.count().then(n => `  teacher_subject_assignments:  ${n} rows`),
    prisma.student.count().then(n => `  students:                     ${n} rows`),
    prisma.exam.count().then(n => `  exams:                        ${n} rows`),
    prisma.examSubjectConfig.count().then(n => `  exam_subject_configs:         ${n} rows`),
    prisma.mark.count().then(n => `  marks:                        ${n} rows`),
    prisma.auditLog.count().then(n => `  audit_logs:                   ${n} rows`),
    prisma.notification.count().then(n => `  notifications:                ${n} rows`),
  ]);
  counts.forEach(c => console.log(c));

  console.log('\n=== ENUM TYPES IN DATABASE ===');
  const enums = await prisma.$queryRawUnsafe(`
    SELECT typname, array_agg(enumlabel ORDER BY enumsortorder) AS values
    FROM pg_type
    JOIN pg_enum ON pg_type.oid = pg_enum.enumtypid
    GROUP BY typname
    ORDER BY typname
  `);
  enums.forEach(e => console.log(`  ${e.typname}: [${e.values.join(', ')}]`));

  console.log('\n=== FOREIGN KEYS ===');
  const fks = await prisma.$queryRawUnsafe(`
    SELECT
      tc.table_name AS "from_table",
      kcu.column_name AS "from_col",
      ccu.table_name AS "to_table",
      ccu.column_name AS "to_col"
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name
  `);
  fks.forEach(fk => console.log(`  ${fk.from_table}.${fk.from_col} → ${fk.to_table}.${fk.to_col}`));

  console.log('\n✅ STATUS: ALL CHECKS PASSED — database fully connected and operational');
}

main()
  .catch(e => {
    console.error('\n❌ ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
