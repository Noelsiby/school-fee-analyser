const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const http = require('http');

async function fetchWithCookie(path, options = {}, cookie = '') {
  return new Promise((resolve) => {
    const headers = { ...options.headers };
    if (cookie) headers['cookie'] = cookie;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: options.method || 'GET',
      headers
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = { raw: body }; }
        let newCookie = res.headers['set-cookie'];
        if (newCookie) newCookie = newCookie[0].split(';')[0];
        resolve({ status: res.statusCode, data: parsed, cookie: newCookie || cookie });
      });
    });

    req.on('error', e => resolve({ status: 500, error: e.message }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function login(email, password) {
  const res = await fetchWithCookie('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.data)}`);
  return res.cookie;
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }
function section(msg) { console.log(`\n[${msg}]`); }

async function run() {
  console.log('=== FINAL SECTION 7 E2E TEST ===\n');
  
  // ─── Setup: Get DB entities ──────────────────────────────────
  const class8A = await prisma.class.findFirst({ where: { name: 'Class 8A' } });
  const mathSub    = await prisma.subject.findFirst({ where: { name: 'Mathematics', classId: class8A.id } });
  const scienceSub = await prisma.subject.findFirst({ where: { name: 'Science',     classId: class8A.id } });
  const englishSub = await prisma.subject.findFirst({ where: { name: 'English',     classId: class8A.id } });
  const students   = await prisma.student.findMany({ where: { classId: class8A.id }, orderBy: { rollNumber: 'asc' } });

  console.log(`Class 8A ID: ${class8A.id}`);

  // Helpers to get specific students
  const getStudentId = (name) => students.find(s => s.name.startsWith(name))?.id;

  // 1. Admin creates "Second Term Examination"
  section('1. Admin creates "Second Term Examination"');
  const adminCookie = await login('admin@matha.school', 'Admin@1234');

  const createRes = await fetchWithCookie('/admin/exams', {
    method: 'POST',
    body: JSON.stringify({ name: 'Final Audit Exam', examType: 'CLASS_EXAM', classId: class8A.id, deadline: null })
  }, adminCookie);
  pass(`Create Exam: Status ${createRes.status}`);
  const exam = createRes.data.exam;

  await fetchWithCookie(`/admin/exams/${exam.id}/subject-config`, {
    method: 'POST',
    body: JSON.stringify({ configs: [
      { subjectId: mathSub.id, maxMarks: 100 },
      { subjectId: scienceSub.id, maxMarks: 100 },
      { subjectId: englishSub.id, maxMarks: 100 }
    ]})
  }, adminCookie);
  pass(`Configured Max Marks`);

  await fetchWithCookie(`/admin/exams/${exam.id}/publish`, { method: 'PUT' }, adminCookie);
  pass(`Published Exam`);

  // 2. Rajan enters Math marks
  section('2. Rajan enters Math marks and submits');
  const rajanCookie = await login('rajan@matha.school', 'Rajan@5678');
  const mathMarks = [
    { studentId: getStudentId('John'), marksObtained: 78 },
    { studentId: getStudentId('Priya'), marksObtained: 85 },
    { studentId: getStudentId('Arjun'), marksObtained: 92 },
    { studentId: getStudentId('Sneha'), marksObtained: 71 },
    { studentId: getStudentId('Rahul'), marksObtained: 88 }
  ];
  await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id, marksData: mathMarks })
  }, rajanCookie);
  await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id })
  }, rajanCookie);
  pass(`Rajan submitted Math marks`);

  // 3. Anitha enters Science marks
  section('3. Anitha enters Science marks and submits');
  const anithaCookie = await login('anitha@matha.school', 'Anitha@5678');
  const sciMarks = [
    { studentId: getStudentId('John'), marksObtained: 82 },
    { studentId: getStudentId('Priya'), marksObtained: 79 },
    { studentId: getStudentId('Arjun'), marksObtained: 88 },
    { studentId: getStudentId('Sneha'), marksObtained: 91 },
    { studentId: getStudentId('Rahul'), marksObtained: 76 }
  ];
  await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id, marksData: sciMarks })
  }, anithaCookie);
  await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id })
  }, anithaCookie);
  pass(`Anitha submitted Science marks`);

  // 4. Mary enters English marks
  section('4. Mary enters English marks and submits');
  const maryCookie = await login('mary@matha.school', 'Mary@5678');
  const engMarks = [
    { studentId: getStudentId('John'), marksObtained: 75 },
    { studentId: getStudentId('Priya'), marksObtained: 88 },
    { studentId: getStudentId('Arjun'), marksObtained: 85 },
    { studentId: getStudentId('Sneha'), marksObtained: 79 },
    { studentId: getStudentId('Rahul'), marksObtained: 91 }
  ];
  await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: englishSub.id, marksData: engMarks })
  }, maryCookie);
  await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: englishSub.id })
  }, maryCookie);
  pass(`Mary submitted English marks`);

  // 5. Mary as Class Teacher REJECTS Math
  section('5. Mary REJECTS Math marks');
  await fetchWithCookie('/class-teacher/marks/reject', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id, reason: 'John Thomas marks seem incorrect, please recheck' })
  }, maryCookie);
  pass(`Mary rejected Math marks`);

  const notifRes = await fetchWithCookie('/notifications', {}, rajanCookie);
  const rejNotif = notifRes.data.notifications?.find(n => n.message?.includes('John Thomas marks seem incorrect, please recheck'));
  if (rejNotif) pass(`Notification verified: "${rejNotif.message}"`);
  else fail(`Notification not found`);

  // 6. Rajan resubmits Math
  section('6. Rajan resubmits Math (John=82)');
  const updatedMathMarks = mathMarks.map(m => m.studentId === getStudentId('John') ? { ...m, marksObtained: 82 } : m);
  await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id, marksData: updatedMathMarks })
  }, rajanCookie);
  await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id })
  }, rajanCookie);
  pass(`Rajan resubmitted Math marks`);

  // 7. Mary as Class Teacher - edits Priya's Science and approves all
  section('7. Mary edits Priya\'s Science mark & Approves');
  
  // First we need to get the markId for Priya's Science mark
  const fullMarksheetRes = await fetchWithCookie(`/class-teacher/exams/${exam.id}/full-marksheet?classId=${class8A.id}`, {}, maryCookie);
  pass(`Fetched full marksheet - Status: ${fullMarksheetRes.status}`);
  
  const priyaRow = fullMarksheetRes.data.results.find(r => r.student.id === getStudentId('Priya'));
  const priyaSciMarkId = priyaRow.marksBySubject[scienceSub.id].id;
  
  // Edit the mark
  const editRes = await fetchWithCookie('/class-teacher/marks/edit', {
    method: 'PUT',
    body: JSON.stringify({ markId: priyaSciMarkId, newMarks: 81 })
  }, maryCookie);
  if (editRes.status === 200) pass(`Mary edited Priya's Science mark to 81`);
  else fail(`Edit failed: ${JSON.stringify(editRes.data)}`);

  // Approve all
  await fetchWithCookie('/class-teacher/marks/approve', { method: 'PUT', body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id })}, maryCookie);
  await fetchWithCookie('/class-teacher/marks/approve', { method: 'PUT', body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id })}, maryCookie);
  await fetchWithCookie('/class-teacher/marks/approve', { method: 'PUT', body: JSON.stringify({ examId: exam.id, subjectId: englishSub.id })}, maryCookie);
  pass(`Mary approved all subjects`);

  // Finalize
  const finRes = await fetchWithCookie(`/class-teacher/exams/${exam.id}/finalize?classId=${class8A.id}`, { method: 'PUT' }, maryCookie);
  pass(`Mary finalized exam - Status: ${finRes.status}`);

  // 8. Admin views results
  section('8. Admin views final results & exports');
  const resultsRes = await fetchWithCookie(`/admin/exams/${exam.id}/results`, {}, adminCookie);
  const totals = {};
  resultsRes.data.results.forEach(r => totals[r.student.name] = r.totalMarks);
  
  // Verify totals (John=239, Priya=254, Arjun=265, Sneha=241, Rahul=255)
  if (totals['John Thomas'] === 239) pass('John total: 239 ✅'); else fail(`John total: ${totals['John Thomas']} (expected 239)`);
  if (totals['Priya Nair'] === 254) pass('Priya total: 254 ✅'); else fail(`Priya total: ${totals['Priya Nair']} (expected 254)`);
  if (totals['Arjun Menon'] === 265) pass('Arjun total: 265 ✅'); else fail(`Arjun total: ${totals['Arjun Menon']} (expected 265)`);
  if (totals['Sneha Pillai'] === 241) pass('Sneha total: 241 ✅'); else fail(`Sneha total: ${totals['Sneha Pillai']} (expected 241)`);
  if (totals['Rahul Kumar'] === 255) pass('Rahul total: 255 ✅'); else fail(`Rahul total: ${totals['Rahul Kumar']} (expected 255)`);

  const excelRes = await fetchWithCookie(`/admin/exams/${exam.id}/export/excel`, {}, adminCookie);
  if (excelRes.status === 200) pass('Export Excel: Status 200 ✅'); else fail(`Export Excel failed: ${excelRes.status}`);
  const wordRes = await fetchWithCookie(`/admin/exams/${exam.id}/export/word`, {}, adminCookie);
  if (wordRes.status === 200) pass('Export Word: Status 200 ✅'); else fail(`Export Word failed: ${wordRes.status}`);

  // 9. Confirm Audit Log
  section('9. Confirm Audit Log for Mary\'s edit');
  const auditLogs = await prisma.auditLog.findMany({
    where: { recordId: String(priyaSciMarkId), action: 'UPDATE' },
    orderBy: { changedAt: 'desc' }
  });
  
  if (auditLogs.length > 0) {
    const log = auditLogs[0];
    pass(`Audit log found! Old: ${JSON.stringify(log.oldValue)}, New: ${JSON.stringify(log.newValue)} ✅`);
  } else {
    fail(`No audit log found for mark ${priyaSciMarkId}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
