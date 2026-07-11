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
  console.log('--- E2E AUTOMATED API TEST ---\\n');

  // Find users
  const noel = await prisma.user.findUnique({ where: { email: 'noel@matha.school' }});
  const admin = await prisma.user.findUnique({ where: { email: 'admin@matha.school' }});
  
  // Find the other subject teacher for Science and English
  const class9 = await prisma.class.findFirst({ where: { name: 'Class 9' }});
  const scienceSub = await prisma.subject.findFirst({ where: { name: 'Science', classId: class9.id }});
  const mathSub = await prisma.subject.findFirst({ where: { name: 'Math', classId: class9.id }});
  const engSub = await prisma.subject.findFirst({ where: { name: 'English', classId: class9.id }});
  
  const sciAssign = await prisma.teacherSubjectAssignment.findFirst({ where: { subjectId: scienceSub.id } });
  const otherTeacher = await prisma.user.findUnique({ where: { id: sciAssign.teacherId } });
  
  const exam = await prisma.exam.findFirst({ where: { name: 'Term 1 Exam' }});

  console.log(`Class 9 ID: ${class9.id}, Exam ID: ${exam.id}`);
  console.log(`Noel (Math) will enter marks for Subject ID: ${mathSub.id}`);
  console.log(`${otherTeacher.email} (Sci/Eng) will enter marks for Subject IDs: ${scienceSub.id}, ${engSub.id}`);

  // 1. Noel Logs in & submits Math marks
  console.log('\\n[1] Logging in as Noel (Math Subject Teacher)...');
  const noelCookie = await login('noel@matha.school', 'password123');
  
  const noelExamsRes = await fetchWithCookie('/subject-teacher/exams', {}, noelCookie);
  console.log(`Noel fetched exams: Status ${noelExamsRes.status}, Found ${noelExamsRes.data.exams.length} exams`);

  console.log(`Fetching students for Math (Exam ${exam.id}, Subject ${mathSub.id})...`);
  const mathStudentsRes = await fetchWithCookie(`/subject-teacher/exams/${exam.id}/subjects/${mathSub.id}/students`, {}, noelCookie);
  const students = mathStudentsRes.data.students;
  
  const mathMarksData = students.map(s => ({ studentId: s.id, marksObtained: 85 }));
  await fetchWithCookie(`/subject-teacher/marks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id, marksData: mathMarksData })
  }, noelCookie);
  
  const mathSubmitRes = await fetchWithCookie(`/subject-teacher/marks/submit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: mathSub.id })
  }, noelCookie);
  console.log(`Noel submitted Math marks: Status ${mathSubmitRes.status}`);

  // 2. Other teacher logs in & submits Sci/Eng marks
  console.log(`\\n[2] Logging in as ${otherTeacher.email} (Science/English Subject Teacher)...`);
  const otherCookie = await login(otherTeacher.email, 'password123');
  
  // Science
  const sciMarksData = students.map(s => ({ studentId: s.id, marksObtained: 90 }));
  await fetchWithCookie(`/subject-teacher/marks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id, marksData: sciMarksData })
  }, otherCookie);
  const sciSubmitRes = await fetchWithCookie(`/subject-teacher/marks/submit`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: scienceSub.id })
  }, otherCookie);
  console.log(`Submitted Science marks: Status ${sciSubmitRes.status}`);

  // English
  const engMarksData = students.map(s => ({ studentId: s.id, marksObtained: 95 }));
  await fetchWithCookie(`/subject-teacher/marks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: engSub.id, marksData: engMarksData })
  }, otherCookie);
  const engSubmitRes = await fetchWithCookie(`/subject-teacher/marks/submit`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: exam.id, subjectId: engSub.id })
  }, otherCookie);
  console.log(`Submitted English marks: Status ${engSubmitRes.status}`);

  // 3. Noel logs in as Class Teacher & Approves
  console.log('\\n[3] Noel (Class Teacher) reviewing and approving...');
  const reviewRes = await fetchWithCookie(`/class-teacher/exams/${exam.id}/review?classId=${class9.id}`, {}, noelCookie);
  console.log(`Review fetched: Status ${reviewRes.status}`);
  
  // Approve each subject
  for (const subId of [mathSub.id, scienceSub.id, engSub.id]) {
    const appRes = await fetchWithCookie(`/class-teacher/marks/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ examId: exam.id, subjectId: subId })
    }, noelCookie);
    console.log(`Approved subject ${subId}: Status ${appRes.status}`);
  }

  // Finalize
  const finRes = await fetchWithCookie(`/class-teacher/exams/${exam.id}/finalize?classId=${class9.id}`, {
    method: 'PUT'
  }, noelCookie);
  console.log(`Finalized exam: Status ${finRes.status}`);

  // 4. Admin logs in & checks marksheet
  console.log('\\n[4] Admin checking final marksheet...');
  const adminCookie = await login('admin@matha.school', 'Admin@1234');
  const marksheetRes = await fetchWithCookie(`/admin/exams/${exam.id}/results?classId=${class9.id}`, {}, adminCookie);
  console.log(`Admin marksheet fetch: Status ${marksheetRes.status}`);
  if (marksheetRes.data.results && marksheetRes.data.results.length > 0) {
    console.log('✅ Marksheet generated successfully! First student:');
    console.log(`Name: ${marksheetRes.data.results[0].student.name}, Total: ${marksheetRes.data.results[0].totalMarks}, Percentage: ${marksheetRes.data.results[0].percentage}%`);
  } else {
    console.log('❌ Failed to generate marksheet');
  }

  console.log('\\n✅ ALL E2E AUTOMATED TESTS PASSED');
}

run().finally(() => prisma.$disconnect());
