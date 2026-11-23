/**
 * migrate.js — runs `prisma migrate deploy`, patiently.
 *
 * Why: on Render the OLD server keeps running (and holding database connections) while the
 * new one builds. On the small Aiven plan that can leave no free connection, and the build
 * failed with "remaining connection slots are reserved". So:
 *   node scripts/migrate.js --build   (in the build) tries a few times; if the database is
 *                                     only FULL, the build carries on instead of failing.
 *   require('./scripts/migrate').inBackground()   (at start-up) keeps trying until it works,
 *                                     which is soon after the old server has stopped.
 * Real migration errors (bad SQL etc.) still fail the build.
 */
const { spawn } = require('child_process');
const path = require('path');

const BUSY = /remaining connection slots|too many clients|P1001|P1017|Can't reach database|timed out|ECONNRESET|ETIMEDOUT/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: path.join(__dirname, '..'), shell: true, env: process.env,
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    child.on('close', (code) => resolve({ ok: code === 0, busy: code !== 0 && BUSY.test(out) }));
  });
}

async function migrate({ tries, waitMs, label }) {
  for (let i = 1; i <= tries; i += 1) {
    const r = await runOnce();
    if (r.ok) { console.log(`[migrate] ${label}: database is up to date.`); return 'ok'; }
    if (!r.busy) return 'error';
    console.log(`[migrate] ${label}: database is full (try ${i}/${tries}); waiting ${waitMs / 1000}s…`);
    if (i < tries) await sleep(waitMs);
  }
  return 'busy';
}

/** At start-up: keep trying in the background (every 30 s for up to ~15 min). */
function inBackground() {
  migrate({ tries: 30, waitMs: 30 * 1000, label: 'start-up' })
    .then((r) => { if (r !== 'ok') console.error(`[migrate] start-up: could not update the database (${r}).`); })
    .catch((e) => console.error('[migrate]', e.message));
}

module.exports = { inBackground };

if (require.main === module && process.argv.includes('--build')) {
  migrate({ tries: 4, waitMs: 15 * 1000, label: 'build' }).then((r) => {
    if (r === 'error') process.exit(1);
    if (r === 'busy') console.log('[migrate] build: skipped for now; the server will finish it after it starts.');
    process.exit(0);
  });
}
