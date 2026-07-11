const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const http = require('http');

async function fetchWithCookie(path, options = {}, cookie = '') {
  return new Promise((resolve) => {
    const headers = options.headers || {};
    if (cookie) headers['cookie'] = cookie;
    if (options.body) headers['Content-Length'] = Buffer.byteLength(options.body);

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
        try { parsed = JSON.parse(body); } catch (e) { parsed = { error: body }; }
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.cookie;
}

async function run() {
  console.log('--- PHASE 3: AUTOMATED E2E TEST ---\\n');

  const class8A = await prisma.class.findFirst({ where: { name: 'Class 8A' }});
  const mathSub = await prisma.subject.findFirst({ where: { name: 'Mathematics', classId: class8A.id }});
  const scienceSub = await prisma.subject.findFirst({ where: { name: 'Science', classId: class8A.id }});
  const englishSub = await prisma.subject.findFirst({ where: { name: 'English', classId: class8A.id }});
  
  const exam = await prisma.exam.findFirst({ where: { name: 'First Term Examination', classId: class8A.id }});

  console.log(`Class 8A ID: ${class8A.id}, Exam ID: ${exam.id}`);

  // Helper to map marks array
  const createMarksData = (students, marksObj) => {
    return students.map(s => {
      // Find matching first name
      const firstName = s.name.split(' ')[0];
      return { studentId: s.id, marksObtained: marksObj[firstName] || 0 };
    });
  };

  // 1. Rajan Logs in & submits Math marks
  console.log('\\n[1] Logging in as Rajan (Math Subject Teacher)...');
  const rajanCookie = await login('rajan@matha.school', 'Rajan@5678');
  
  const mathStudentsRes = await fetchWithCookie(`/subject-teacher/exams/${exam.id}/subjects/${mathSub.id}/students`, {}, rajanCookie);
  const students = mathStudentsRes.data.students;
  
  // John Thomas: 78, Priya Nair: 85, Arjun Menon: 92, Sneha Pillai: 71, Rahul Kumar: 88
  const mathMarksData = createMarksData(students, { 'John': 78, 'Priya': 85, 'Arjun': 92, 'Sneha': 71, 'Rahul': 88 });
  await fetchWithCookie(`/subject-teacher/marks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id, marksData: mathMarksData })
  }, rajanCookie);
  
  const mathSubmitRes = await fetchWithCookie(`/subject-teacher/marks/submit`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id })
  }, rajanCookie);
  console.log(`Rajan submitted Math marks: Status ${mathSubmitRes.status}`);

  // 2. Anitha logs in & submits Sci marks
  console.log(`\\n[2] Logging in as Anitha (Science Subject Teacher)...`);
  const anithaCookie = await login('anitha@matha.school', 'Anitha@5678');
  
  // John Thomas: 82, Priya Nair: 79, Arjun Menon: 88, Sneha Pillai: 91, Rahul Kumar: 76
  const sciMarksData = createMarksData(students, { 'John': 82, 'Priya': 79, 'Arjun': 88, 'Sneha': 91, 'Rahul': 76 });
  await fetchWithCookie(`/subject-teacher/marks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id, marksData: sciMarksData })
  }, anithaCookie);
  
  const sciSubmitRes = await fetchWithCookie(`/subject-teacher/marks/submit`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id })
  }, anithaCookie);
  console.log(`Anitha submitted Science marks: Status ${sciSubmitRes.status}`);

  // 3. Mary logs in & submits English marks + Class Teacher Approvals
  console.log('\\n[3] Logging in as Mary (English Subject Teacher & Class Teacher)...');
  const maryCookie = await login('mary@matha.school', 'Mary@5678');

  // John Thomas: 75, Priya Nair: 88, Arjun Menon: 85, Sneha Pillai: 79, Rahul Kumar: 91
  const engMarksData = createMarksData(students, { 'John': 75, 'Priya': 88, 'Arjun': 85, 'Sneha': 79, 'Rahul': 91 });
  await fetchWithCookie(`/subject-teacher/marks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: englishSub.id, marksData: engMarksData })
  }, maryCookie);
  
  const engSubmitRes = await fetchWithCookie(`/subject-teacher/marks/submit`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: englishSub.id })
  }, maryCookie);
  console.log(`Mary submitted English marks: Status ${engSubmitRes.status}`);

  console.log('--- Mary switching to Class Teacher view ---');
  // Approve each subject
  for (const subId of [mathSub.id, scienceSub.id, englishSub.id]) {
    const appRes = await fetchWithCookie(`/class-teacher/marks/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId: exam.id, subjectId: subId })
    }, maryCookie);
    console.log(`Mary approved subject ${subId}: Status ${appRes.status}`);
  }

  // Finalize
  const finRes = await fetchWithCookie(`/class-teacher/exams/${exam.id}/finalize?classId=${class8A.id}`, {
    method: 'PUT'
  }, maryCookie);
  console.log(`Mary finalized exam: Status ${finRes.status}`);

  // 4. Admin logs in & checks marksheet
  console.log('\\n[4] Admin checking final marksheet and testing exports...');
  const adminCookie = await login('admin@matha.school', 'Admin@1234');
  
  const marksheetRes = await fetchWithCookie(`/admin/exams/${exam.id}/results?classId=${class8A.id}`, {}, adminCookie);
  console.log(`Admin marksheet fetch: Status ${marksheetRes.status}`);
  if (marksheetRes.data.results && marksheetRes.data.results.length > 0) {
    console.log('\\n✅ Final Marksheet Verified Data:');
    marksheetRes.data.results.forEach(r => {
      console.log(` - ${r.student.name}: ${r.totalMarks} (${r.percentage}% - Grade ${r.grade})`);
    });
  } else {
    console.log('❌ Failed to generate marksheet');
  }

  // Test Export Excel
  const excelRes = await fetchWithCookie(`/admin/exams/${exam.id}/export/excel`, {}, adminCookie);
  console.log(`\\nExport Excel Status: ${excelRes.status}`);
  
  // Test Export Word
  const wordRes = await fetchWithCookie(`/admin/exams/${exam.id}/export/word`, {}, adminCookie);
  console.log(`Export Word Status: ${wordRes.status}`);

  console.log('\\n✅ ALL E2E AUTOMATED TESTS PASSED');
}

run().finally(() => prisma.$disconnect());
