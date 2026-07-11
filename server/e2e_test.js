const fs = require('fs');

const BASE_URL = 'http://localhost:5000/api';

async function fetchWithCookie(url, options = {}, cookie = '') {
  const headers = {
    'Content-Type': 'application/json',
    ...(cookie ? { 'Cookie': cookie } : {}),
    ...(options.headers || {})
  };
  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers
  });
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch (e) { data = { error: text }; }
  let newCookie = res.headers.get('set-cookie');
  if (newCookie) {
    newCookie = newCookie.split(';')[0];
  } else {
    newCookie = cookie;
  }
  return { status: res.status, data, cookie: newCookie };
}

async function runTest() {
  console.log('--- STARTING END-TO-END TEST ---');

  // STEP 1: SUBJECT TEACHER
  console.log('\\n--- 1. SUBJECT TEACHER FLOW ---');
  let res = await fetchWithCookie('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'subjectteacher@matha.school', password: 'Teacher@1234' }) });
  console.log(`Login Status: ${res.status} | User: ${res.data.user.name}`);
  let cookie = res.cookie;

  // Get Exams
  res = await fetchWithCookie('/subject-teacher/exams', {}, cookie);
  if (res.data.exams.length === 0) {
    console.log('No exams found for Subject Teacher. Make sure there is an Open exam.');
    return;
  }
  const exam = res.data.exams[0];
  console.log(`Found Exam: ${exam.name} (ID: ${exam.id})`);
  
  // Find a subject ID for this exam
  const subjectConfig = exam.subjectConfigs[0];
  if (!subjectConfig) return console.log('No subject config found!');
  const subjectId = subjectConfig.subjectId;
  console.log(`Selected Subject ID: ${subjectId} (${subjectConfig.subject.name})`);

  // Get Students
  res = await fetchWithCookie(`/subject-teacher/exams/${exam.id}/subjects/${subjectId}/students`, {}, cookie);
  const students = res.data.students;
  console.log(`Found ${students.length} students in class ${res.data.class.name}.`);

  if (students.length === 0) return console.log('No students to grade.');

  // Enter Marks
  const marksToSubmit = students.map(s => ({
    studentId: s.id,
    marksObtained: 85,
    remarks: 'Good'
  }));
  res = await fetchWithCookie('/subject-teacher/marks', {
    method: 'POST',
    body: JSON.stringify({ examId: exam.id, subjectId: subjectId, marksData: marksToSubmit })
  }, cookie);
  console.log(`Save Marks Status: ${res.status} | Msg: ${res.data.message || res.data.error}`);

  // Submit to Class Teacher
  res = await fetchWithCookie('/subject-teacher/marks/submit', {
    method: 'PUT',
    body: JSON.stringify({ examId: exam.id, subjectId: subjectId })
  }, cookie);
  console.log(`Submit Marks Status: ${res.status} | Msg: ${res.data.message || res.data.error}`);

  // Logout
  await fetchWithCookie('/auth/logout', { method: 'POST' }, cookie);


  // STEP 2: CLASS TEACHER
  console.log('\\n--- 2. CLASS TEACHER FLOW ---');
  res = await fetchWithCookie('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'classteacher@matha.school', password: 'Teacher@1234' }) });
  console.log(`Login Status: ${res.status} | User: ${res.data.user.name}`);
  let ctCookie = res.cookie;

  // Get Exams
  res = await fetchWithCookie('/class-teacher/exams', {}, ctCookie);
  const ctExam = res.data.exams.find(e => e.id === exam.id);
  if (!ctExam) return console.log('Exam not found for Class Teacher.');
  console.log(`Found Exam: ${ctExam.name} (ID: ${ctExam.id}) for Class ID: ${ctExam.targetClassId}`);

  // Review
  res = await fetchWithCookie(`/class-teacher/exams/${ctExam.id}/review?classId=${ctExam.targetClassId}`, {}, ctCookie);
  const reviewData = res.data;
  console.log(`Review Data loaded. Class: ${reviewData.class.name}`);
  const subjectReview = reviewData.subjectReviews.find(r => r.subject.id === subjectId);
  console.log(`Subject Status before approve: ${subjectReview.status}`);

  if (subjectReview.status === 'SubmittedToClassTeacher') {
    // Approve
    res = await fetchWithCookie('/class-teacher/marks/approve', {
      method: 'PUT',
      body: JSON.stringify({ examId: ctExam.id, subjectId: subjectId })
    }, ctCookie);
    console.log(`Approve Marks Status: ${res.status} | Msg: ${res.data.message}`);
  }

  // Finalize
  res = await fetchWithCookie(`/class-teacher/exams/${ctExam.id}/finalize?classId=${ctExam.targetClassId}`, { method: 'PUT' }, ctCookie);
  console.log(`Finalize Exam Status: ${res.status} | Msg: ${res.data.message || res.data.error}`);

  // Logout
  await fetchWithCookie('/auth/logout', { method: 'POST' }, ctCookie);


  // STEP 3: ADMIN
  console.log('\\n--- 3. ADMIN FLOW ---');
  res = await fetchWithCookie('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@matha.school', password: 'Admin@1234' }) });
  console.log(`Login Status: ${res.status} | User: ${res.data.user.name}`);
  let adminCookie = res.cookie;

  res = await fetchWithCookie('/admin/exams', {}, adminCookie);
  const adminExam = res.data.exams.find(e => e.id === exam.id);
  console.log(`Admin sees exam status: ${adminExam.status}, isLocked: ${adminExam.isLocked}`);

  res = await fetchWithCookie(`/admin/exams/${exam.id}/results`, {}, adminCookie);
  console.log(`Results fetch status: ${res.status}. Data has ${res.data.length} class(es).`);
  
  if (res.data.length > 0) {
    console.log(`Sample Student from Class ${res.data[0].class.name}:`);
    const student = res.data[0].students[0];
    console.log(`  Name: ${student.name}`);
    console.log(`  Total Marks: ${student.totalObtained} / ${student.totalMax}`);
    console.log(`  Percentage: ${student.percentage}%`);
  }

  console.log('\\n--- E2E TEST COMPLETE ---');
}

runTest().catch(console.error);
