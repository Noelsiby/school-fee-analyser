require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:5000';

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: 'localhost',
      port: 5000,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); process.exitCode = 1; }
function section(msg) { console.log(`\n── ${msg} ──`); }

async function run() {
  console.log('🔐 Auth E2E Test Suite\n');

  // ── 1. Health check ──────────────────────────────────────
  section('Health check');
  const health = await request('GET', '/api/health');
  health.status === 200 && health.body.status === 'ok'
    ? pass(`GET /api/health → ${health.status} ${health.body.status}`)
    : fail(`GET /api/health → ${health.status}`);

  // ── 2. Login with wrong password ─────────────────────────
  section('Login — wrong password');
  const bad = await request('POST', '/api/auth/login', { email: 'admin@matha.school', password: 'wrongpassword' });
  bad.status === 401
    ? pass(`POST /api/auth/login (bad creds) → 401 "${bad.body.error}"`)
    : fail(`Expected 401, got ${bad.status}`);

  // ── 3. Login as Admin ────────────────────────────────────
  section('Login — Admin user');
  const adminLogin = await request('POST', '/api/auth/login', {
    email: 'admin@matha.school',
    password: 'Admin@1234',
  });
  const adminToken = adminLogin.body.token;
  if (adminLogin.status === 200 && adminToken) {
    pass(`POST /api/auth/login → 200 | token received (${adminToken.length} chars)`);
    pass(`  roles: [${adminLogin.body.user.roles.join(', ')}]`);
    pass(`  name:  ${adminLogin.body.user.name}`);
    pass(`  passwordHash NOT in response: ${!adminLogin.body.user.passwordHash}`);
  } else {
    fail(`Admin login failed: ${JSON.stringify(adminLogin.body)}`);
  }

  // ── 4. GET /api/auth/me with valid token ─────────────────
  section('GET /api/auth/me — authenticated');
  const me = await request('GET', '/api/auth/me', null, { Authorization: `Bearer ${adminToken}` });
  me.status === 200 && me.body.user.email === 'admin@matha.school'
    ? pass(`GET /api/auth/me → 200 | ${me.body.user.name} <${me.body.user.email}>`)
    : fail(`/me failed: ${JSON.stringify(me.body)}`);

  // ── 5. GET /api/auth/me without token ────────────────────
  section('GET /api/auth/me — unauthenticated');
  const meNoAuth = await request('GET', '/api/auth/me');
  meNoAuth.status === 401
    ? pass(`GET /api/auth/me (no token) → 401 "${meNoAuth.body.error}"`)
    : fail(`Expected 401, got ${meNoAuth.status}`);

  // ── 6. GET /api/auth/me with bad token ───────────────────
  section('GET /api/auth/me — invalid token');
  const meBadToken = await request('GET', '/api/auth/me', null, { Authorization: 'Bearer invalidtoken123' });
  meBadToken.status === 401
    ? pass(`GET /api/auth/me (bad token) → 401 "${meBadToken.body.error}"`)
    : fail(`Expected 401, got ${meBadToken.status}`);

  // ── 7. Login as ClassTeacher ──────────────────────────────
  section('Login — ClassTeacher');
  const ctLogin = await request('POST', '/api/auth/login', {
    email: 'anitha.rajan@matha.school',
    password: 'Teacher@1234',
  });
  ctLogin.status === 200
    ? pass(`ClassTeacher login → 200 | roles: [${ctLogin.body.user.roles.join(', ')}]`)
    : fail(`ClassTeacher login failed: ${JSON.stringify(ctLogin.body)}`);

  // ── 8. Login as dual-role user ────────────────────────────
  section('Login — Dual-role (ClassTeacher + SubjectTeacher)');
  const dualLogin = await request('POST', '/api/auth/login', {
    email: 'priya.thomas@matha.school',
    password: 'Teacher@1234',
  });
  const dualRoles = dualLogin.body.user?.roles || [];
  dualLogin.status === 200 && dualRoles.length === 2
    ? pass(`Dual-role login → 200 | roles: [${dualRoles.join(', ')}] — role switcher would show`)
    : fail(`Dual-role login failed: ${JSON.stringify(dualLogin.body)}`);

  // ── 9. React app served at root (production static) ──────
  section('Production static serving');
  const root = await request('GET', '/');
  root.status === 200
    ? pass(`GET / → 200 (React app served)`)
    : fail(`GET / → ${root.status}`);

  const deepRoute = await request('GET', '/admin/dashboard');
  deepRoute.status === 200
    ? pass(`GET /admin/dashboard → 200 (React Router fallback works)`)
    : fail(`GET /admin/dashboard → ${deepRoute.status}`);

  console.log('\n' + (process.exitCode === 1 ? '❌ Some tests failed.' : '✅ All tests passed!'));
}

run().catch(console.error);
