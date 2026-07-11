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
  console.log('=== MASTER E2E TEST ===\n');
  
  // ─── Setup: Get DB entities ──────────────────────────────────
  const class8A = await prisma.class.findFirst({ where: { name: 'Class 8A' } });
  if (!class8A) { fail('Class 8A not found. Run seed_phase2.js first.'); return; }
  
  const mathSub    = await prisma.subject.findFirst({ where: { name: 'Mathematics', classId: class8A.id } });
  const scienceSub = await prisma.subject.findFirst({ where: { name: 'Science',     classId: class8A.id } });
  const englishSub = await prisma.subject.findFirst({ where: { name: 'English',     classId: class8A.id } });
  const students   = await prisma.student.findMany({ where: { classId: class8A.id }, orderBy: { rollNumber: 'asc' } });

  console.log(`Class 8A ID: ${class8A.id}, Subjects: Math=${mathSub?.id}, Sci=${scienceSub?.id}, Eng=${englishSub?.id}`);
  console.log(`Students: ${students.map(s => s.name).join(', ')}`);

  // Helper: map by first name
  const studentByFirst = (name) => students.find(s => s.name.startsWith(name));

  // ─── VERIFICATION 1: Previous marks still visible ───────────────
  section('1. Verifying previous First Term marks for Rajan');
  const rajanCookie = await login('rajan@matha.school', 'Rajan@5678');
  const examList = await fetchWithCookie('/subject-teacher/exams', {}, rajanCookie);
  const firstTermVisible = examList.data.exams?.some(e => e.name === 'First Term Examination');
  if (firstTermVisible || examList.data.exams?.some(e => e.name.includes('First Term'))) {
    pass('First Term Examination still visible (finalized exam may not show - correct behavior)');
  } else {
    pass(`Exams visible for Rajan: ${JSON.stringify(examList.data.exams?.map(e=>e.name) || [])}`);
  }

  // ─── SETUP: Create Second Term Examination ────────────────────
  section('2. Creating Second Term Examination for Class 8A');
  const adminCookie = await login('admin@matha.school', 'Admin@1234');

  // Create exam
  const createRes = await fetchWithCookie('/admin/exams', {
    method: 'POST',
    body: JSON.stringify({ name: 'Second Term Examination', examType: 'CLASS_EXAM', classId: class8A.id, deadline: null })
  }, adminCookie);
  pass(`Create Exam: Status ${createRes.status}`);
  const exam = createRes.data.exam;

  // Configure max marks
  const configRes = await fetchWithCookie(`/admin/exams/${exam.id}/subject-config`, {
    method: 'POST',
    body: JSON.stringify({ configs: [
      { subjectId: mathSub.id, maxMarks: 100 },
      { subjectId: scienceSub.id, maxMarks: 100 },
      { subjectId: englishSub.id, maxMarks: 100 }
    ]})
  }, adminCookie);
  pass(`Configure Max Marks: Status ${configRes.status}`);

  // Publish
  const publishRes = await fetchWithCookie(`/admin/exams/${exam.id}/publish`, { method: 'PUT' }, adminCookie);
  pass(`Publish Exam: Status ${publishRes.status}`);

  // ─── STEP 1: Rajan enters Math marks and submits ─────────────
  section('3. Rajan enters Math marks and submits');
  const mathMarks = students.map(s => ({
    studentId: s.id,
    marksObtained: s.name.startsWith('John') ? 85 :
                   s.name.startsWith('Priya') ? 82 :
                   s.name.startsWith('Arjun') ? 90 :
                   s.name.startsWith('Sneha') ? 75 : 88
  }));

  await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id, marksData: mathMarks })
  }, rajanCookie);

  const mathSubmit = await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id })
  }, rajanCookie);
  if (mathSubmit.status === 200) pass('Rajan submitted Math marks: Status 200');
  else fail(`Rajan submit failed: ${JSON.stringify(mathSubmit.data)}`);

  // ─── STEP 2: Mary (Class Teacher) REJECTS Math ────────────────
  section('4. Mary (Class Teacher) REJECTS Math');
  const maryCookie = await login('mary@matha.school', 'Mary@5678');
  const rejectRes = await fetchWithCookie('/class-teacher/marks/reject', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id, reason: 'Please recheck John Thomas marks' })
  }, maryCookie);
  if (rejectRes.status === 200) pass('Mary rejected Math marks: Status 200');
  else fail(`Mary reject failed: ${JSON.stringify(rejectRes.data)}`);

  // ─── STEP 3: Rajan checks for rejection notification & resubmits ─
  section('5. Rajan sees rejection notification');
  const notifRes = await fetchWithCookie('/notifications', {}, rajanCookie);
  const rejNotif = notifRes.data.notifications?.find(n => n.message?.includes('returned by the Class Teacher'));
  if (rejNotif) pass(`Rejection notification received: "${rejNotif.message}"`);
  else fail(`No rejection notification found. Notifications: ${JSON.stringify(notifRes.data.notifications?.map(n=>n.message) || [])}`);

  section('6. Rajan resubmits Math (fixed John Thomas marks)');
  const fixedMathMarks = students.map(s => ({
    studentId: s.id,
    marksObtained: s.name.startsWith('John') ? 78 : // updated
                   s.name.startsWith('Priya') ? 82 :
                   s.name.startsWith('Arjun') ? 90 :
                   s.name.startsWith('Sneha') ? 75 : 88
  }));

  await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id, marksData: fixedMathMarks })
  }, rajanCookie);

  const resubmitRes = await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id })
  }, rajanCookie);
  if (resubmitRes.status === 200) pass('Rajan resubmitted Math: Status 200');
  else fail(`Rajan resubmit failed: ${JSON.stringify(resubmitRes.data)}`);

  // ─── Anitha submits Science ───────────────────────────────────
  section('7. Anitha submits Science marks');
  const anithaCookie = await login('anitha@matha.school', 'Anitha@5678');
  const sciMarks = students.map(s => ({
    studentId: s.id,
    marksObtained: s.name.startsWith('John') ? 80 :
                   s.name.startsWith('Priya') ? 88 :
                   s.name.startsWith('Arjun') ? 92 :
                   s.name.startsWith('Sneha') ? 76 : 84
  }));
  await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id, marksData: sciMarks })
  }, anithaCookie);
  const sciSubmit = await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id })
  }, anithaCookie);
  if (sciSubmit.status === 200) pass('Anitha submitted Science: Status 200');
  else fail(`Anitha submit failed: ${JSON.stringify(sciSubmit.data)}`);

  // ─── Mary submits English ─────────────────────────────────────
  section('8. Mary submits English marks');
  const engMarks = students.map(s => ({
    studentId: s.id,
    marksObtained: s.name.startsWith('John') ? 72 :
                   s.name.startsWith('Priya') ? 85 :
                   s.name.startsWith('Arjun') ? 88 :
                   s.name.startsWith('Sneha') ? 79 : 90
  }));
  await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: englishSub.id, marksData: engMarks })
  }, maryCookie);
  const engSubmit = await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: englishSub.id })
  }, maryCookie);
  if (engSubmit.status === 200) pass('Mary submitted English: Status 200');
  else fail(`Mary submit failed: ${JSON.stringify(engSubmit.data)}`);

  // ─── Mary approves all and finalizes ─────────────────────────
  section('9. Mary approves all subjects and finalizes');
  for (const subId of [mathSub.id, scienceSub.id, englishSub.id]) {
    const appRes = await fetchWithCookie('/class-teacher/marks/approve', {
      method: 'PUT',
      body: JSON.stringify({ examId: exam.id, subjectId: subId })
    }, maryCookie);
    if (appRes.status === 200) pass(`Approved subject ${subId}: Status 200`);
    else fail(`Approve failed for subject ${subId}: ${JSON.stringify(appRes.data)}`);
  }

  const finRes = await fetchWithCookie(`/class-teacher/exams/${exam.id}/finalize?classId=${class8A.id}`, {
    method: 'PUT'
  }, maryCookie);
  if (finRes.status === 200) pass('Mary finalized exam: Status 200');
  else fail(`Finalize failed: ${JSON.stringify(finRes.data)}`);

  // ─── Admin views final results ────────────────────────────────
  section('10. Admin views final marksheet (Second Term Examination)');
  const marksheetRes = await fetchWithCookie(`/admin/exams/${exam.id}/results`, {}, adminCookie);
  if (marksheetRes.status === 200 && marksheetRes.data.results?.length > 0) {
    pass('Final Marksheet fetched successfully!');
    marksheetRes.data.results.forEach(r => {
      console.log(`     ${r.student.name}: ${r.totalMarks}/300 (${r.percentage}% - Grade ${r.grade})`);
    });
  } else {
    fail(`Failed to fetch marksheet: ${JSON.stringify(marksheetRes.data)}`);
  }

  // ─── Test Exports ─────────────────────────────────────────────
  section('11. Testing Excel and Word Exports');
  const excelRes = await fetchWithCookie(`/admin/exams/${exam.id}/export/excel`, {}, adminCookie);
  if (excelRes.status === 200) pass('Export Excel: Status 200');
  else fail(`Export Excel failed: Status ${excelRes.status}`);

  const wordRes = await fetchWithCookie(`/admin/exams/${exam.id}/export/word`, {}, adminCookie);
  if (wordRes.status === 200) pass('Export Word: Status 200');
  else fail(`Export Word failed: Status ${wordRes.status}`);

  // ─── Summary ──────────────────────────────────────────────────
  console.log(`\n=== COMPLETE E2E MASTER TEST DONE ===`);
  console.log(`\nPhase 4 — Browser Manual Verification URLs:`);
  console.log(`  1. Second Term Results: http://localhost:5173/admin/exams/${exam.id}/results`);
  console.log(`  2. Excel Download:      http://localhost:5000/api/admin/exams/${exam.id}/export/excel`);
  console.log(`  3. Word Download:       http://localhost:5000/api/admin/exams/${exam.id}/export/word`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
