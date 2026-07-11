require('dotenv').config();
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 5000,
      path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // Login
  const login = await req('POST', '/api/auth/login', { email: 'admin@matha.school', password: 'Admin@1234' });
  const token = login.data.token;
  console.log('✅ Logged in as Admin\n');

  // Get existing teachers
  const teachers = await req('GET', '/api/admin/teachers', null, token);
  const ct  = teachers.data.teachers.find(t => t.email === 'classteacher@matha.school');
  const st1 = teachers.data.teachers.find(t => t.email === 'subjectteacher@matha.school');
  const st2 = teachers.data.teachers.find(t => t.email === 'dualteacher@matha.school');
  console.log(`Teachers available: ${ct.name}, ${st1.name}, ${st2.name}`);

  // Step 1: Create class
  const clsRes = await req('POST', '/api/admin/classes', { name: 'Test 11-B (API Test)' }, token);
  if (clsRes.status !== 201) { console.error('❌ Class create failed:', clsRes.data); return; }
  const cls = clsRes.data.class;
  console.log(`\n1. Class created: "${cls.name}" (ID=${cls.id})`);

  // Step 2: Add 2 students
  const stu1 = await req('POST', '/api/admin/students', { name: 'Alice Kumar', rollNumber: '01', classId: cls.id }, token);
  const stu2 = await req('POST', '/api/admin/students', { name: 'Bob Nair',    rollNumber: '02', classId: cls.id }, token);
  console.log(`2. Students added: "${stu1.data.student.name}", "${stu2.data.student.name}"`);

  // Step 3: Assign Class Teacher
  await req('PUT', `/api/admin/classes/${cls.id}/assign-class-teacher`, { classTeacherId: ct.id }, token);
  console.log(`3. Class Teacher assigned: ${ct.name}`);

  // Step 4: Create subjects
  const math = await req('POST', '/api/admin/subjects', { name: 'Mathematics', classId: cls.id }, token);
  const sci  = await req('POST', '/api/admin/subjects', { name: 'Science',     classId: cls.id }, token);
  const eng  = await req('POST', '/api/admin/subjects', { name: 'English',     classId: cls.id }, token);
  console.log(`4. Subjects created: Mathematics (${math.data.subject.id}), Science (${sci.data.subject.id}), English (${eng.data.subject.id})`);

  // Step 5a: Class Teacher also teaches Mathematics
  const a1 = await req('POST', '/api/admin/teacher-assignments', { teacherId: ct.id, subjectId: math.data.subject.id, classId: cls.id }, token);
  console.log(`5a. ${ct.name} → Mathematics: ${a1.status === 201 ? '✅' : '❌'} (${a1.status})`);

  // Step 5b: SubjectTeacher1 → Science
  const a2 = await req('POST', '/api/admin/teacher-assignments', { teacherId: st1.id, subjectId: sci.data.subject.id, classId: cls.id }, token);
  console.log(`5b. ${st1.name} → Science: ${a2.status === 201 ? '✅' : '❌'} (${a2.status})`);

  // Step 5c: SubjectTeacher2 → English
  const a3 = await req('POST', '/api/admin/teacher-assignments', { teacherId: st2.id, subjectId: eng.data.subject.id, classId: cls.id }, token);
  console.log(`5c. ${st2.name} → English: ${a3.status === 201 ? '✅' : '❌'} (${a3.status})`);

  // Final verification
  const detail = await req('GET', `/api/admin/classes/${cls.id}`, null, token);
  const d = detail.data.class;
  console.log('\n=== FINAL CLASS DETAIL VERIFICATION ===\n');
  console.log(`Class:         ${d.name}`);
  console.log(`Class Teacher: ${d.classTeacher?.name} (${d.classTeacher?.email})`);
  console.log(`Students:      ${d.students.length} → ${d.students.map(s => s.name).join(', ')}`);
  console.log(`Subjects:      ${d.subjects.length} → ${d.subjects.map(s => s.name).join(', ')}`);
  console.log(`Assignments:   ${d.teacherAssignments.length}`);
  d.teacherAssignments.forEach(a => {
    console.log(`  ↳ ${a.teacher.name} [${a.teacher.roles.join('+')}] → ${a.subject.name}`);
  });

  const allPass = d.students.length === 2 && d.subjects.length === 3 && d.teacherAssignments.length === 3 && d.classTeacher;
  console.log(`\n${allPass ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);

  // Cleanup
  await req('DELETE', `/api/admin/classes/${cls.id}`, null, token);
  console.log(`\n🧹 Test class deleted (cleanup done).`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
