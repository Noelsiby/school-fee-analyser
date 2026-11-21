/**
 * /api/tuition — the head of tuition's own area (role TuitionHead). The admin has no access.
 *
 *   Tuition classes   her own batches, each with a monthly fee
 *   Teachers          a list she keeps (name, phone, subjects, classes); they don't log in
 *   Students          school students she adds to a tuition class (fee can differ per student)
 *   Fees              each month: who paid, how much, when; who still owes
 *   Messages          to tuition parents: free app notification first, WhatsApp for the rest
 */
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate, authorize } = require('../middleware/auth');
const wa = require('../lib/whatsapp');
const { notifyFamilies } = require('../lib/push');
const { byRoll } = require('../lib/rollOrder');
const { byClassName } = require('../lib/classOrder');
const notices = require('../controllers/noticeController')._internal;

const prisma = new PrismaClient();
router.use(authenticate, authorize('TuitionHead'));

const fail = (res, err, code = 500) => { if (code === 500) console.error('[tuition]', err); res.status(code).json({ error: err.message || String(err) }); };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
const monthOf = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date(d));
const money = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1000000 ? Math.round(n * 100) / 100 : null; };
const cleanText = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const feeOf = (ts) => (ts.feeOverride ?? ts.class.monthlyFee);
/** "2026-08" … "2026-11": months from `from` to `to` (inclusive), at most 24. */
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 24) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

// ── Summary (dashboard) ──
router.get('/summary', async (req, res) => {
  try {
    const month = thisMonth();
    const [classes, teachers, students, paid] = await Promise.all([
      prisma.tuitionClass.count(), prisma.tuitionTeacher.count(),
      prisma.tuitionStudent.findMany({ include: { class: true } }),
      prisma.tuitionPayment.findMany({ where: { month }, select: { tuitionStudentId: true, amount: true } }),
    ]);
    const paidIds = new Set(paid.map((p) => p.tuitionStudentId));
    const due = students.filter((s) => monthOf(s.joinedOn) <= month);
    res.json({
      month, classes, teachers, students: students.length,
      expected: due.reduce((n, s) => n + feeOf(s), 0),
      collected: paid.reduce((n, p) => n + p.amount, 0),
      unpaid: due.filter((s) => !paidIds.has(s.id) && feeOf(s) > 0).length,
    });
  } catch (err) { fail(res, err); }
});

// ── Tuition classes ──
router.get('/classes', async (req, res) => {
  try {
    const classes = await prisma.tuitionClass.findMany({
      include: { _count: { select: { students: true } }, teachers: { include: { teacher: { select: { id: true, name: true } } } } },
    });
    res.json({ classes: classes.sort(byClassName).map((c) => ({ id: c.id, name: c.name, monthlyFee: c.monthlyFee, students: c._count.students, teachers: c.teachers.map((t) => t.teacher) })) });
  } catch (err) { fail(res, err); }
});
async function saveClass(req, res, id) {
  const name = cleanText(req.body?.name, 60);
  const monthlyFee = money(req.body?.monthlyFee);
  if (!name) return res.status(400).json({ error: 'Give the tuition class a name, e.g. "Class 6 Evening".' });
  if (monthlyFee === null) return res.status(400).json({ error: 'Monthly fee must be a number (0 or more).' });
  try {
    const data = { name, monthlyFee };
    const c = id ? await prisma.tuitionClass.update({ where: { id }, data }) : await prisma.tuitionClass.create({ data });
    res.status(id ? 200 : 201).json({ class: c });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: `There is already a tuition class called "${name}".` });
    fail(res, err);
  }
}
router.post('/classes', (req, res) => saveClass(req, res, null));
router.put('/classes/:id', (req, res) => saveClass(req, res, Number(req.params.id)));
router.delete('/classes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const n = await prisma.tuitionStudent.count({ where: { classId: id } });
    if (n) return res.status(409).json({ error: `Move or remove its ${n} student${n === 1 ? '' : 's'} first.` });
    await prisma.tuitionClass.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
});

// ── Teachers ──
router.get('/teachers', async (req, res) => {
  try {
    const teachers = await prisma.tuitionTeacher.findMany({ orderBy: { name: 'asc' }, include: { classes: { include: { class: { select: { id: true, name: true } } } } } });
    res.json({ teachers: teachers.map((t) => ({ id: t.id, name: t.name, phone: t.phone, subjects: t.subjects, classes: t.classes.map((c) => c.class).sort(byClassName) })) });
  } catch (err) { fail(res, err); }
});
async function saveTeacher(req, res, id) {
  const name = cleanText(req.body?.name, 80);
  const phone = cleanText(req.body?.phone, 20) || null;
  const subjects = cleanText(req.body?.subjects, 200) || null;
  const classIds = [...new Set((req.body?.classIds || []).map(Number).filter(Boolean))];
  if (!name) return res.status(400).json({ error: "Type the teacher's name." });
  try {
    const t = await prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.tuitionTeacher.update({ where: { id }, data: { name, phone, subjects } })
        : await tx.tuitionTeacher.create({ data: { name, phone, subjects } });
      await tx.tuitionTeaching.deleteMany({ where: { teacherId: saved.id } });
      if (classIds.length) await tx.tuitionTeaching.createMany({ data: classIds.map((classId) => ({ teacherId: saved.id, classId })), skipDuplicates: true });
      return saved;
    });
    res.status(id ? 200 : 201).json({ teacher: t });
  } catch (err) { fail(res, err); }
}
router.post('/teachers', (req, res) => saveTeacher(req, res, null));
router.put('/teachers/:id', (req, res) => saveTeacher(req, res, Number(req.params.id)));
router.delete('/teachers/:id', async (req, res) => {
  try { await prisma.tuitionTeacher.delete({ where: { id: Number(req.params.id) } }); res.json({ ok: true }); }
  catch (err) { fail(res, err); }
});

// ── Students ──
router.get('/students', async (req, res) => {
  try {
    const rows = await prisma.tuitionStudent.findMany({
      include: { class: true, student: { select: { id: true, name: true, rollNumber: true, parentPhone: true, class: { select: { name: true } } } } },
    });
    res.json({
      students: rows.map((r) => ({
        id: r.id, studentId: r.studentId, name: r.student.name, rollNumber: r.student.rollNumber, schoolClass: r.student.class.name,
        parentPhone: r.student.parentPhone, tuitionClassId: r.classId, tuitionClass: r.class.name,
        fee: feeOf(r), feeOverride: r.feeOverride, classFee: r.class.monthlyFee, joinedOn: r.joinedOn,
      })).sort((a, b) => byClassName(a.tuitionClass, b.tuitionClass) || a.name.localeCompare(b.name)),
    });
  } catch (err) { fail(res, err); }
});
// School students to choose from (not in tuition yet): ?q=name or ?classId=school class
router.get('/school-students', async (req, res) => {
  try {
    const q = cleanText(req.query.q, 60);
    const classId = Number(req.query.classId) || undefined;
    if (!q && !classId) return res.json({ students: [] });
    const list = await prisma.student.findMany({
      where: { tuition: null, ...(classId ? { classId } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { rollNumber: q }] } : {}) },
      select: { id: true, name: true, rollNumber: true, class: { select: { id: true, name: true } } },
      take: 200,
    });
    res.json({ students: list.sort((a, b) => byClassName(a.class, b.class) || byRoll(a, b)) });
  } catch (err) { fail(res, err); }
});
router.get('/school-classes', async (req, res) => {
  try { res.json({ classes: (await prisma.class.findMany({ select: { id: true, name: true } })).sort(byClassName) }); }
  catch (err) { fail(res, err); }
});
router.post('/students', async (req, res) => {
  const ids = [...new Set((req.body?.studentIds || []).map(Number).filter(Boolean))];
  const classId = Number(req.body?.classId);
  if (!ids.length) return res.status(400).json({ error: 'Choose at least one student.' });
  try {
    if (!classId || !(await prisma.tuitionClass.findUnique({ where: { id: classId } }))) return res.status(400).json({ error: 'Choose a tuition class.' });
    const { count } = await prisma.tuitionStudent.createMany({ data: ids.map((studentId) => ({ studentId, classId })), skipDuplicates: true });
    res.status(201).json({ added: count, alreadyIn: ids.length - count });
  } catch (err) { fail(res, err); }
});
router.put('/students/:id', async (req, res) => {
  try {
    const data = {};
    if (req.body?.classId !== undefined) data.classId = Number(req.body.classId);
    if (req.body?.feeOverride !== undefined) {
      if (req.body.feeOverride === null || req.body.feeOverride === '') data.feeOverride = null;
      else { const f = money(req.body.feeOverride); if (f === null) return res.status(400).json({ error: 'Fee must be a number (0 or more).' }); data.feeOverride = f; }
    }
    const s = await prisma.tuitionStudent.update({ where: { id: Number(req.params.id) }, data });
    res.json({ student: s });
  } catch (err) { fail(res, err); }
});
router.delete('/students/:id', async (req, res) => {
  try { await prisma.tuitionStudent.delete({ where: { id: Number(req.params.id) } }); res.json({ ok: true }); }
  catch (err) { fail(res, err); }
});

// ── Fees ──
router.get('/fees', async (req, res) => {
  const month = MONTH.test(String(req.query.month)) ? req.query.month : thisMonth();
  try {
    const rows = await prisma.tuitionStudent.findMany({
      include: { class: true, payments: true, student: { select: { name: true, rollNumber: true, class: { select: { name: true } } } } },
    });
    const list = rows
      .filter((r) => monthOf(r.joinedOn) <= month) // joined after this month: not due yet
      .map((r) => {
        const fee = feeOf(r);
        const pay = r.payments.find((p) => p.month === month) || null;
        // Earlier months (since joining) without a payment
        const earlier = monthsBetween(monthOf(r.joinedOn), month).slice(0, -1).filter((m) => fee > 0 && !r.payments.some((p) => p.month === m));
        return {
          tuitionStudentId: r.id, name: r.student.name, schoolClass: r.student.class.name, rollNumber: r.student.rollNumber,
          tuitionClassId: r.classId, tuitionClass: r.class.name, fee,
          payment: pay && { id: pay.id, amount: pay.amount, paidOn: pay.paidOn, mode: pay.mode, note: pay.note },
          status: !pay ? (fee > 0 ? 'unpaid' : 'free') : pay.amount >= fee ? 'paid' : 'part',
          earlierUnpaid: earlier,
        };
      })
      .sort((a, b) => byClassName(a.tuitionClass, b.tuitionClass) || a.name.localeCompare(b.name));
    res.json({
      month,
      students: list,
      totals: {
        expected: list.reduce((n, s) => n + s.fee, 0),
        collected: list.reduce((n, s) => n + (s.payment?.amount || 0), 0),
        paid: list.filter((s) => s.status === 'paid' || s.status === 'free').length,
        unpaid: list.filter((s) => s.status === 'unpaid' || s.status === 'part').length,
      },
    });
  } catch (err) { fail(res, err); }
});
router.post('/fees', async (req, res) => {
  const tuitionStudentId = Number(req.body?.tuitionStudentId);
  const month = String(req.body?.month || '');
  const amount = money(req.body?.amount);
  const paidOn = req.body?.paidOn ? new Date(`${String(req.body.paidOn).slice(0, 10)}T00:00:00.000Z`) : new Date();
  if (!MONTH.test(month)) return res.status(400).json({ error: 'Choose the month.' });
  if (amount === null || amount <= 0) return res.status(400).json({ error: 'Type the amount paid.' });
  if (isNaN(paidOn)) return res.status(400).json({ error: 'The date is not valid.' });
  try {
    const data = { amount, paidOn, mode: cleanText(req.body?.mode, 20) || null, note: cleanText(req.body?.note, 200) || null, recordedById: req.user.userId };
    const p = await prisma.tuitionPayment.upsert({
      where: { tuitionStudentId_month: { tuitionStudentId, month } },
      create: { tuitionStudentId, month, ...data },
      update: data,
    });
    res.status(201).json({ payment: p });
  } catch (err) { fail(res, err); }
});
router.delete('/fees/:id', async (req, res) => {
  try { await prisma.tuitionPayment.delete({ where: { id: Number(req.params.id) } }); res.json({ ok: true }); }
  catch (err) { fail(res, err); }
});

// ── Messages to tuition parents ──
/** { type: 'all' | 'classes' | 'students' | 'unpaid', classIds?, studentIds? (tuition student ids), month? } → school student ids */
async function tuitionAudience(a) {
  const where = a?.type === 'classes' ? { classId: { in: (a.classIds || []).map(Number) } }
    : a?.type === 'students' ? { id: { in: (a.studentIds || []).map(Number) } }
    : {};
  let rows = await prisma.tuitionStudent.findMany({ where, include: { class: true, payments: true } });
  if (a?.type === 'unpaid') {
    const month = MONTH.test(String(a.month)) ? a.month : thisMonth();
    rows = rows.filter((r) => monthOf(r.joinedOn) <= month && feeOf(r) > 0 && !r.payments.some((p) => p.month === month && p.amount >= feeOf(r)));
  }
  return rows.map((r) => r.studentId);
}
router.get('/messages', async (req, res) => {
  try {
    const list = await prisma.notice.findMany({ where: { scope: 'tuition' }, orderBy: { createdAt: 'desc' }, take: 50, include: { messages: { select: { status: true } } } });
    res.json({ configured: wa.isConfigured(), notices: list.map(({ messages, ...n }) => ({ ...n, total: messages.length, counts: notices.countsOf(messages) })) });
  } catch (err) { fail(res, err); }
});
router.post('/messages/recipients', async (req, res) => {
  try {
    const ids = await tuitionAudience(req.body?.audience);
    if (!ids.length) return res.json({ students: 0, parents: 0, skipped: [] });
    const { students, recipients, skipped } = await notices.resolveAudience({ type: 'students', studentIds: ids });
    res.json({ students, parents: recipients.length, skipped });
  } catch (err) { fail(res, err); }
});
router.post('/messages', async (req, res) => {
  const title = wa.clean(req.body?.title);
  const body = wa.clean(req.body?.body);
  if (title === '-' || title.length > notices.TITLE_MAX) return res.status(400).json({ error: `Write a subject (up to ${notices.TITLE_MAX} characters).` });
  if (body === '-' || body.length > notices.BODY_MAX) return res.status(400).json({ error: `Write a message (up to ${notices.BODY_MAX} characters).` });
  try {
    const ids = await tuitionAudience(req.body?.audience);
    if (!ids.length) return res.status(400).json({ error: 'Nobody matches. Choose who should get the message.' });
    const { recipients, skipped } = await notices.resolveAudience({ type: 'students', studentIds: ids });
    if (!recipients.length) return res.status(400).json({ error: 'None of these students has a parent number yet.' });
    // Stored with the exact students, so the Student App shows it to the right families
    const notice = await prisma.notice.create({
      data: { title, body, scope: 'tuition', audience: { type: 'students', studentIds: ids, tuition: req.body?.audience || null }, createdById: req.user.userId },
    });
    const { reachedPhones } = await notifyFamilies(prisma, recipients.map((r) => ({
      phone: r.phone, studentId: r.students[0]?.id ?? null, type: 'notice',
      title: `📚 ${title}`, body, data: { screen: 'notices', noticeId: notice.id },
    })));
    const viaWhatsApp = req.body?.whatsappOnlyNonApp === false ? recipients : recipients.filter((r) => !reachedPhones.has(r.phone));
    if (viaWhatsApp.length && wa.isConfigured()) {
      await prisma.noticeMessage.createMany({ data: viaWhatsApp.map((r) => ({ noticeId: notice.id, phone: r.phone, students: notices.studentsLabel(r.students), status: 'queued' })) });
    }
    const rows = await prisma.noticeMessage.findMany({ where: { noticeId: notice.id }, orderBy: { id: 'asc' } });
    res.status(201).json({ notice, pushed: reachedPhones.size, queued: rows.length, skipped, whatsappOff: viaWhatsApp.length > 0 && !wa.isConfigured() });
    if (rows.length) notices.sendInBackground(notice, rows);
  } catch (err) { if (!res.headersSent) fail(res, err); }
});

module.exports = router;
