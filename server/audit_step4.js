


const http = require('http');

async function fetchWithCookie(path, options = {}, cookie = '') {
  const headers = options.headers || {};
  if (cookie) {
    headers['cookie'] = cookie;
  }
  headers['Content-Type'] = 'application/json';
  const res = await fetch(`http://localhost:5000/api${path}`, {
    ...options,
    headers
  });
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch (e) { data = { error: text }; }
  let newCookie = res.headers.get('set-cookie');
  if (newCookie) {
    newCookie = newCookie.split(';')[0];
  }
  return { status: res.status, data, cookie: newCookie || cookie };
}

async function run() {
  console.log('\n--- STEP 4: CLASS TEACHER FLOW (Noel) ---');
  let res = await fetchWithCookie('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'noel@matha.school', password: 'password123' })
  });
  const noelCookie = res.cookie;
  console.log('Login Noel Status:', res.status);
  
  res = await fetchWithCookie('/class-teacher/exams', {}, noelCookie);
  console.log('GET /api/class-teacher/exams Response:', res.status);
  console.log(JSON.stringify(res.data, null, 2));

  console.log('\n--- STEP 5: SUBJECT TEACHER FLOW ---');
  res = await fetchWithCookie('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'noel@matha.school', password: 'password123' }) // Noel also has subject teacher role now! Let's just log in as Noel again since he acts as both now.
  });
  const stCookie = res.cookie;
  
  res = await fetchWithCookie('/subject-teacher/exams', {}, stCookie);
  console.log('GET /api/subject-teacher/exams Response:', res.status);
  console.log(JSON.stringify(res.data, null, 2));
}

run();
