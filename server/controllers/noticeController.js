/**
 * noticeController.js — send a school notice (holiday, leave, event, meeting…) to
 * parents on WhatsApp (Admin only). Same pattern as exam results: the request
 * queues one message per parent phone and returns; sending happens in the background.
 */

const { PrismaClient } = require('@prisma/client');
const wa = require('../lib/whatsapp');
const { byRoll } = require('../lib/rollOrder');
const prisma = new PrismaClient();

const SEND_GAP_MS = 400; // gentle pace for the provider
const TITLE_MAX = 60;
const BODY_MAX = 700;    // WhatsApp allows 1024 characters for the whole template body
const STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'];

const byClassName = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/** Clean up the audience sent by the page: { type, classIds?, studentIds? }. */
function parseAudience(a) {
  const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter(Number.isInteger))];
  if (a?.type === 'school') return { type: 'school' };
  if (a?.type === 'classes') return ids(a.classIds).length ? { type: 'classes', classIds: ids(a.classIds) } : null;
  if (a?.type === 'students') return ids(a.studentIds).length ? { type: 'students', studentIds: ids(a.studentIds) } : null;
  return null;
}

/**
 * Who gets the notice: one entry per parent phone (brothers and sisters share one),
 * plus the students skipped because their parent number is missing or wrong.
 */
async function resolveAudience(audience) {
  const where = audience.type === 'classes' ? { classId: { in: audience.classIds } }
    : audience.type === 'students' ? { id: { in: audience.studentIds } }
    : {};
  const students = await prisma.student.findMany({
    where,
    select: { id: true, name: true, rollNumber: true, parentPhone: true, class: { select: { name: true } } },
  });
  students.sort((a, b) => byClassName(a.class.name, b.class.name) || byRoll(a, b));

  const byPhone = new Map();
  const skipped = [];
  for (const s of students) {
    const phone = wa.normalizePhone(s.parentPhone);
    const who = { id: s.id, name: s.name, className: s.class.name };
    if (!phone) {
      skipped.push({ ...who, reason: s.parentPhone ? 'Invalid parent number' : 'No parent number' });
      continue;
    }
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(who);
  }
  const recipients = [...byPhone].map(([phone, kids]) => ({ phone, students: kids }));
  return { students: students.length, recipients, skipped };
}

const studentsLabel = (kids) => kids.map((k) => `${k.name} (${k.className})`).join(', ');

/** Send queued messages one by one in the background. */
function sendInBackground(notice, rows) {
  (async () => {
    for (const row of rows) {
      try {
        const providerMessageId = await wa.sendNoticeTemplate(row.phone, [notice.title, notice.body]);
        await prisma.noticeMessage.update({ where: { id: row.id }, data: { status: 'sent', providerMessageId, error: null } });
      } catch (e) {
        await prisma.noticeMessage.update({ where: { id: row.id }, data: { status: 'failed', error: e.message.slice(0, 500) } });
      }
      await new Promise((r) => setTimeout(r, SEND_GAP_MS));
    }
  })().catch((e) => console.error('[notices] send loop', e));
}

const countsOf = (messages) => {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  messages.forEach((m) => { counts[m.status] = (counts[m.status] || 0) + 1; });
  return counts;
};

// ── GET /api/admin/notices — recent notices with delivery counts ──
exports.list = async (req, res) => {
  try {
    const notices = await prisma.notice.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { messages: { select: { status: true } } },
    });
    res.json({
      configured: wa.isConfigured(),
      notices: notices.map(({ messages, ...n }) => ({ ...n, total: messages.length, counts: countsOf(messages) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/admin/notices/:id — one notice with every parent's status ──
exports.get = async (req, res) => {
  try {
    const notice = await prisma.notice.findUnique({
      where: { id: Number(req.params.id) },
      include: { messages: { orderBy: { id: 'asc' } } },
    });
    if (!notice) return res.status(404).json({ error: 'Notice not found.' });
    res.json({ notice: { ...notice, counts: countsOf(notice.messages) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/admin/notices/recipients  { audience } — preview who will get it ──
exports.recipients = async (req, res) => {
  const audience = parseAudience(req.body?.audience);
  if (!audience) return res.status(400).json({ error: 'Choose who should get the message.' });
  try {
    const { students, recipients, skipped } = await resolveAudience(audience);
    res.json({ students, parents: recipients.length, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/admin/notices  { title, body, audience } — save and send ──
exports.create = async (req, res) => {
  const title = wa.clean(req.body?.title);
  const body = wa.clean(req.body?.body);
  const audience = parseAudience(req.body?.audience);

  if (!wa.isConfigured()) {
    return res.status(503).json({ error: 'WhatsApp is not set up yet. Add RICHAUTOMATE_API_KEY in Render → Environment.' });
  }
  if (title === '-' || title.length > TITLE_MAX) return res.status(400).json({ error: `Write a subject (up to ${TITLE_MAX} characters).` });
  if (body === '-' || body.length > BODY_MAX) return res.status(400).json({ error: `Write a message (up to ${BODY_MAX} characters).` });
  if (!audience) return res.status(400).json({ error: 'Choose who should get the message.' });

  try {
    const { recipients, skipped } = await resolveAudience(audience);
    if (!recipients.length) return res.status(400).json({ error: 'None of these students has a parent number yet.' });

    const notice = await prisma.notice.create({
      data: { title, body, audience, createdById: req.user.userId },
    });
    await prisma.noticeMessage.createMany({
      data: recipients.map((r) => ({ noticeId: notice.id, phone: r.phone, students: studentsLabel(r.students), status: 'queued' })),
    });
    const rows = await prisma.noticeMessage.findMany({ where: { noticeId: notice.id }, orderBy: { id: 'asc' } });

    res.status(201).json({ notice, queued: rows.length, skipped });
    sendInBackground(notice, rows);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};

// ── POST /api/admin/notices/:id/retry — send the failed ones again ──
exports.retry = async (req, res) => {
  if (!wa.isConfigured()) return res.status(503).json({ error: 'WhatsApp is not set up yet.' });
  try {
    const notice = await prisma.notice.findUnique({ where: { id: Number(req.params.id) } });
    if (!notice) return res.status(404).json({ error: 'Notice not found.' });
    const failed = await prisma.noticeMessage.findMany({ where: { noticeId: notice.id, status: 'failed' }, orderBy: { id: 'asc' } });
    await prisma.noticeMessage.updateMany({ where: { id: { in: failed.map((m) => m.id) } }, data: { status: 'queued', error: null } });
    res.json({ queued: failed.length });
    sendInBackground(notice, failed);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};

// ── POST /api/admin/notices/:id/refresh — ask the provider for delivery updates ──
exports.refresh = async (req, res) => {
  if (!wa.isConfigured()) return res.json({ updated: 0 });
  try {
    const rows = await prisma.noticeMessage.findMany({
      where: { noticeId: Number(req.params.id), status: { in: ['sent', 'delivered'] }, providerMessageId: { not: null } },
      take: 300,
    });
    let updated = 0;
    for (const row of rows) {
      try {
        const { status, error } = await wa.fetchStatus(row.providerMessageId);
        if (status && status !== row.status && STATUSES.includes(status)) {
          await prisma.noticeMessage.update({ where: { id: row.id }, data: { status, error } });
          updated++;
        }
      } catch { /* leave as is; try again next refresh */ }
    }
    res.json({ updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
