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

const { authenticate, authorize } = require('../middleware/auth');
const wa = require('../lib/whatsapp');
const { notifyFamilies } = require('../lib/push');
const { byRoll } = require('../lib/rollOrder');
const { byClassName } = require('../lib/classOrder');
const notices = require('../controllers/noticeController')._internal;
const { buildClassReport } = require('../lib/reportData');
const { passMark } = require('../lib/grades');
const fees = require('../lib/tuitionFees');

const prisma = require('../lib/prisma'); // shared, small pool
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

/** "2026-11" + (-5) → "2026-06" */
function addMonths(month, k) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ── Summary (dashboard) ──
router.get('/summary', async (req, res) => {
  try {
    const month = thisMonth();
    const [classes, teachers, students, paid, salaries] = await Promise.all([
      prisma.tuitionClass.count(), prisma.tuitionTeacher.findMany({ select: { monthlySalary: true } }),
      prisma.tuitionStudent.findMany({ include: { class: true } }),
      prisma.tuitionPayment.findMany({ where: { month }, select: { tuitionStudentId: true, amount: true } }),
      prisma.tuitionSalary.findMany({ where: { month }, select: { amount: true } }),
    ]);
    const paidIds = new Set(paid.map((p) => p.tuitionStudentId));
    const due = students.filter((s) => monthOf(s.joinedOn) <= month);
    res.json({
      month, classes, teachers: teachers.length, students: students.length,
      salaryDue: teachers.reduce((n, t) => n + t.monthlySalary, 0),
      salaryPaid: salaries.reduce((n, x) => n + x.amount, 0),
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
    res.json({ teachers: teachers.map((t) => ({ id: t.id, name: t.name, phone: t.phone, subjects: t.subjects, monthlySalary: t.monthlySalary, fromSchool: !!t.schoolUserId, classes: t.classes.map((c) => c.class).sort(byClassName) })) });
  } catch (err) { fail(res, err); }
});
// School teachers who are not in tuition yet (to pick from)
router.get('/school-teachers', async (req, res) => {
  try {
    const linked = (await prisma.tuitionTeacher.findMany({ where: { schoolUserId: { not: null } }, select: { schoolUserId: true } })).map((t) => t.schoolUserId);
    const users = await prisma.user.findMany({
      where: { roles: { hasSome: ['ClassTeacher', 'SubjectTeacher', 'TuitionHead'] }, id: { notIn: linked } },
      select: { id: true, name: true, email: true }, orderBy: { name: 'asc' },
    });
    res.json({ teachers: users });
  } catch (err) { fail(res, err); }
});

async function saveTeacher(req, res, id) {
  // Picked from the school's teachers: the name comes from their school account
  const schoolUserId = !id && req.body?.schoolUserId ? Number(req.body.schoolUserId) : null;
  if (schoolUserId) {
    const u = await prisma.user.findUnique({ where: { id: schoolUserId }, select: { name: true } });
    if (!u) return res.status(400).json({ error: 'That school teacher was not found.' });
    req.body.name = req.body.name || u.name;
  }
  const name = cleanText(req.body?.name, 80);
  const phone = cleanText(req.body?.phone, 20) || null;
  const subjects = cleanText(req.body?.subjects, 200) || null;
  const classIds = [...new Set((req.body?.classIds || []).map(Number).filter(Boolean))];
  const monthlySalary = req.body?.monthlySalary === undefined || req.body?.monthlySalary === '' ? 0 : money(req.body.monthlySalary);
  if (!name) return res.status(400).json({ error: "Type the teacher's name." });
  if (monthlySalary === null) return res.status(400).json({ error: 'Salary must be a number (0 or more).' });
  try {
    const t = await prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.tuitionTeacher.update({ where: { id }, data: { name, phone, subjects, monthlySalary } })
        : await tx.tuitionTeacher.create({ data: { name, phone, subjects, monthlySalary, schoolUserId } });
      await tx.tuitionTeaching.deleteMany({ where: { teacherId: saved.id } });
      if (classIds.length) await tx.tuitionTeaching.createMany({ data: classIds.map((classId) => ({ teacherId: saved.id, classId })), skipDuplicates: true });
      return saved;
    });
    res.status(id ? 200 : 201).json({ teacher: t });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'This school teacher is already in tuition.' });
    fail(res, err);
  }
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
// School students to choose from: ?q=name or ?classId=school class.
// Students already in tuition are included with their tuition class (shown greyed out).
router.get('/school-students', async (req, res) => {
  try {
    const q = cleanText(req.query.q, 60);
    const classId = Number(req.query.classId) || undefined;
    if (!q && !classId) return res.json({ students: [] });
    const list = await prisma.student.findMany({
      where: { ...(classId ? { classId } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { rollNumber: q }] } : {}) },
      select: { id: true, name: true, rollNumber: true, class: { select: { id: true, name: true } }, tuition: { select: { class: { select: { name: true } } } } },
      take: 300,
    });
    res.json({
      students: list
        .map(({ tuition, ...s }) => ({ ...s, inTuition: tuition?.class.name || null }))
        .sort((a, b) => byClassName(a.class, b.class) || byRoll(a, b)),
    });
  } catch (err) { fail(res, err); }
});
// School classes as cards: how many students, how many already in tuition
router.get('/school-classes', async (req, res) => {
  try {
    const [classes, inTuition] = await Promise.all([
      prisma.class.findMany({ select: { id: true, name: true, _count: { select: { students: true } } } }),
      prisma.tuitionStudent.findMany({ select: { student: { select: { classId: true } } } }),
    ]);
    const tu = new Map();
    inTuition.forEach((t) => tu.set(t.student.classId, (tu.get(t.student.classId) || 0) + 1));
    res.json({ classes: classes.map((c) => ({ id: c.id, name: c.name, students: c._count.students, inTuition: tu.get(c.id) || 0 })).sort(byClassName) });
  } catch (err) { fail(res, err); }
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
      include: { class: true, payments: true, student: { select: { name: true, rollNumber: true, parentPhone: true, class: { select: { name: true } } } } },
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
          family: wa.normalizePhone(r.student.parentPhone) || null, // brothers and sisters share the parent number
          payment: pay && { id: pay.id, amount: pay.amount, paidOn: pay.paidOn, mode: pay.mode, note: pay.note, receiptSentAt: pay.receiptSentAt, receiptVia: pay.receiptVia },
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
  if (a?.type === 'owing') {
    const now = thisMonth();
    rows = rows.filter((r) => feeOf(r) > 0 && monthsBetween(monthOf(r.joinedOn), now).some((m) => r.payments.filter((p) => p.month === m).reduce((n, p) => n + p.amount, 0) < feeOf(r)));
  }
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


// ── Settings: UPI / GPay QR for fee payments ──
const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
const getSettings = async () => { const { reminderLog, lastAutoMonth, ...rest } = await fees.getSettings(prisma); return rest; };
router.get('/settings', async (req, res) => { try { res.json({ settings: await getSettings() }); } catch (err) { fail(res, err); } });
router.put('/settings', async (req, res) => {
  const upiId = cleanText(req.body?.upiId, 100);
  const payeeName = cleanText(req.body?.payeeName, 50) || 'Matha School Tuition';
  if (upiId && !UPI_ID.test(upiId)) return res.status(400).json({ error: 'That doesn\'t look like a UPI ID. It looks like name@bank, e.g. 9876543210@okaxis (see GPay → Profile → UPI ID).' });
  try {
    await fees.saveSettings(prisma, { ...(await fees.getSettings(prisma)), upiId, payeeName });
    res.json({ settings: await getSettings() });
  } catch (err) { fail(res, err); }
});

// ── Fee receipts: ?ids=1,2 (one family) ──
const receiptFail = (res, err) => fail(res, err, err.code || 500);
router.get('/fees/receipt', async (req, res) => {
  try { res.json({ receipt: await fees.buildReceipt(prisma, String(req.query.ids || '').split(',')) }); }
  catch (err) { receiptFail(res, err); }
});
router.post('/fees/receipt', async (req, res) => {
  try {
    const receipt = await fees.buildReceipt(prisma, req.body?.paymentIds);
    const result = await fees.sendReceipt(prisma, receipt);
    res.json(result);
  } catch (err) { receiptFail(res, err); }
});

// ── Automatic fee reminder (once a month, on the day she picks) ──
async function reminderState() {
  const settings = await fees.getSettings(prisma);
  const { families, noPhone, month } = await fees.reminderFamilies(prisma, settings.reminder.scope);
  return {
    reminder: settings.reminder,
    next: fees.nextReminderDate(settings),
    sentThisMonth: settings.lastAutoMonth === month,
    log: settings.reminderLog,
    whatsappConfigured: wa.isConfigured(),
    preview: {
      families: families.length, students: families.reduce((n, f) => n + f.kids.length, 0),
      total: families.reduce((n, f) => n + f.total, 0), noPhone: noPhone.map((k) => k.name),
      sample: families[0] ? fees.reminderText(families[0], settings) : null,
    },
  };
}
router.get('/reminders', async (req, res) => { try { res.json(await reminderState()); } catch (err) { fail(res, err); } });
router.put('/reminders', async (req, res) => {
  const day = Number(req.body?.day);
  if (!Number.isInteger(day) || day < 1 || day > 28) return res.status(400).json({ error: 'Choose a day from 1 to 28.' });
  const scope = req.body?.scope === 'month' ? 'month' : 'all';
  try {
    const settings = await fees.getSettings(prisma);
    const reminder = { enabled: !!req.body?.enabled, day, scope, note: wa.clean(req.body?.note || '').replace(/^-$/, '').slice(0, 200) };
    const value = { ...settings, reminder };
    // Turned on (or day moved) after this month's day has passed: start from next month,
    // so nobody gets a surprise message right away. "Send now" is there for this month.
    const { y, m, d } = fees.todayIst();
    const month = `${y}-${String(m).padStart(2, '0')}`;
    const changed = !settings.reminder.enabled || settings.reminder.day !== day;
    if (reminder.enabled && changed && d > day && settings.lastAutoMonth !== month) value.lastAutoMonth = month;
    await fees.saveSettings(prisma, value);
    res.json(await reminderState());
  } catch (err) { fail(res, err); }
});
router.post('/reminders/send', async (req, res) => {
  try { const entry = await fees.sendReminders(prisma, { auto: false }); res.json({ entry, ...(await reminderState()) }); }
  catch (err) { fail(res, err); }
});

// ── Fees analyser: who owes what (all months since joining), month by month, per class ──
router.get('/fees/analysis', async (req, res) => {
  try {
    const now = thisMonth();
    const rows = await prisma.tuitionStudent.findMany({
      include: { class: true, payments: true, student: { select: { name: true, parentPhone: true, class: { select: { name: true } } } } },
    });
    const owing = [];
    const byMonth = new Map();   // month → { due, collected }
    const byClass = new Map();   // class → { due, collected, students }
    const last = monthsBetween(addMonths(now, -5), now); // the last 6 months
    last.forEach((m) => byMonth.set(m, { month: m, due: 0, collected: 0 }));
    for (const r of rows) {
      const fee = feeOf(r);
      const months = monthsBetween(monthOf(r.joinedOn), now);
      let owed = 0; const owedMonths = [];
      for (const m of months) {
        const paid = r.payments.filter((p) => p.month === m).reduce((n, p) => n + p.amount, 0);
        if (fee > paid) { owed += fee - paid; owedMonths.push(m); }
        if (byMonth.has(m)) { const b = byMonth.get(m); b.due += fee; b.collected += paid; }
      }
      const c = byClass.get(r.class.name) || { name: r.class.name, due: 0, collected: 0, students: 0 };
      c.students++; c.due += fee; c.collected += r.payments.filter((p) => p.month === now).reduce((n, p) => n + p.amount, 0);
      byClass.set(r.class.name, c);
      if (owed > 0) owing.push({ tuitionStudentId: r.id, name: r.student.name, schoolClass: r.student.class.name, tuitionClass: r.class.name, fee, owed, owedMonths, hasPhone: !!r.student.parentPhone });
    }
    owing.sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
    res.json({
      month: now,
      totalOwed: owing.reduce((n, o) => n + o.owed, 0),
      owing,
      months: [...byMonth.values()],
      classes: [...byClass.values()].sort((a, b) => byClassName(a.name, b.name)),
    });
  } catch (err) { fail(res, err); }
});

// ── Teacher salaries ──
router.get('/salaries', async (req, res) => {
  const month = MONTH.test(String(req.query.month)) ? req.query.month : thisMonth();
  try {
    const teachers = await prisma.tuitionTeacher.findMany({ orderBy: { name: 'asc' }, include: { salaries: { where: { month } } } });
    const list = teachers.map((t) => ({ teacherId: t.id, name: t.name, monthlySalary: t.monthlySalary, payment: t.salaries[0] || null }));
    res.json({
      month, teachers: list,
      totals: { due: list.reduce((n, t) => n + t.monthlySalary, 0), paid: list.reduce((n, t) => n + (t.payment?.amount || 0), 0) },
    });
  } catch (err) { fail(res, err); }
});
router.post('/salaries', async (req, res) => {
  const teacherId = Number(req.body?.teacherId);
  const month = String(req.body?.month || '');
  const amount = money(req.body?.amount);
  const paidOn = req.body?.paidOn ? new Date(`${String(req.body.paidOn).slice(0, 10)}T00:00:00.000Z`) : new Date();
  if (!MONTH.test(month)) return res.status(400).json({ error: 'Choose the month.' });
  if (amount === null || amount <= 0) return res.status(400).json({ error: 'Type the amount paid.' });
  try {
    const data = { amount, paidOn, mode: cleanText(req.body?.mode, 20) || null, note: cleanText(req.body?.note, 200) || null };
    const p = await prisma.tuitionSalary.upsert({ where: { teacherId_month: { teacherId, month } }, create: { teacherId, month, ...data }, update: data });
    res.status(201).json({ salary: p });
  } catch (err) { fail(res, err); }
});
router.delete('/salaries/:id', async (req, res) => {
  try { await prisma.tuitionSalary.delete({ where: { id: Number(req.params.id) } }); res.json({ ok: true }); }
  catch (err) { fail(res, err); }
});

// ── Exam results of tuition students only ──
/** Exams (running or finalized) that tuition students wrote, newest first. */
router.get('/exams', async (req, res) => {
  try {
    const classIds = [...new Set((await prisma.tuitionStudent.findMany({ select: { student: { select: { classId: true } } } })).map((r) => r.student.classId))];
    if (!classIds.length) return res.json({ exams: [] });
    const exams = await prisma.exam.findMany({
      where: { status: { in: ['Open', 'Closed'] }, OR: [{ classId: { in: classIds } }, { enrollments: { some: { classId: { in: classIds } } } }] },
      select: { id: true, name: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' },
    });
    res.json({ exams });
  } catch (err) { fail(res, err); }
});
/** One exam: every tuition student who wrote it, with subject marks, %, grade, rank in school class. */
router.get('/exams/:id/results', async (req, res) => {
  const examId = Number(req.params.id);
  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { enrollments: true } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    const examClassIds = exam.classId ? [exam.classId] : exam.enrollments.map((e) => e.classId);
    const tstudents = await prisma.tuitionStudent.findMany({ where: { student: { classId: { in: examClassIds } } }, include: { class: true, student: { select: { classId: true } } } });
    const tuitionOf = new Map(tstudents.map((t) => [t.studentId, t]));
    const classes = [...new Set(tstudents.map((t) => t.student.classId))];
    const out = [];
    for (const classId of classes) {
      const report = await buildClassReport(prisma, examId, classId);
      if (!report) continue;
      // rank among the whole school class (complete results)
      const ranked = report.results.filter((r) => r.complete && r.percentage !== null).sort((a, b) => b.percentage - a.percentage);
      report.results.filter((r) => tuitionOf.has(r.student.id)).forEach((r) => {
        const t = tuitionOf.get(r.student.id);
        out.push({
          tuitionStudentId: t.id, studentId: r.student.id, name: r.student.name, schoolClass: report.class.name, tuitionClass: t.class.name,
          subjects: report.subjects.map((sub, i) => ({ name: sub.name, maxMarks: sub.maxMarks, total: r.subjects[i].total, absent: !!r.subjects[i].absent, grade: r.subjects[i].grade })),
          total: r.total, maxTotal: r.maxTotal, percentage: r.percentage, grade: r.grade, complete: r.complete,
          rank: r.complete ? ranked.findIndex((x) => x.student.id === r.student.id) + 1 || null : null, rankedCount: ranked.length,
        });
      });
    }
    out.sort((a, b) => byClassName(a.tuitionClass, b.tuitionClass) || (b.percentage ?? -1) - (a.percentage ?? -1));
    const pcts = out.filter((r) => r.complete && r.percentage !== null).map((r) => r.percentage);
    res.json({
      exam: { id: exam.id, name: exam.name, status: exam.status },
      passMark: passMark(),
      students: out,
      summary: {
        students: out.length,
        average: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100 : null,
        belowPass: out.filter((r) => r.complete && r.percentage !== null && r.percentage < passMark()).length,
      },
    });
  } catch (err) { fail(res, err); }
});
/** One tuition student: profile, fees, and every exam (finalized results + running exams). */
router.get('/students/:id/report', async (req, res) => {
  try {
    const t = await prisma.tuitionStudent.findUnique({
      where: { id: Number(req.params.id) },
      include: { class: true, payments: { orderBy: { month: 'desc' }, take: 12 }, student: { include: { class: { select: { id: true, name: true, classTeacher: { select: { name: true } } } } } } },
    });
    if (!t) return res.status(404).json({ error: 'Not a tuition student.' });
    const st = t.student;
    const snaps = await prisma.resultSnapshot.findMany({ where: { studentId: st.id }, orderBy: { examDate: 'asc' } });
    const exams = snaps.map((x) => ({
      examId: x.examId, examName: x.examName, date: x.examDate, finalized: true,
      percentage: x.percentage, grade: x.grade, total: x.total, maxTotal: x.maxTotal, rank: x.rank, rankedCount: x.rankedCount, classAverage: x.classAverage,
      subjects: (x.subjects || []).map((s) => ({ name: s.name, total: s.total, maxMarks: s.maxMarks, grade: s.grade, absent: !!s.absent, classAverage: s.classAverage })),
    }));
    // Running exams (not finalized yet): read live
    const have = new Set(exams.map((e) => e.examId));
    const running = await prisma.exam.findMany({ where: { status: 'Open', OR: [{ classId: st.classId }, { enrollments: { some: { classId: st.classId } } }] }, orderBy: { createdAt: 'asc' } });
    for (const e of running) {
      if (have.has(e.id)) continue;
      const rep = await buildClassReport(prisma, e.id, st.classId, { studentId: st.id });
      const r = rep?.results[0];
      if (!r || !r.subjects.some((x) => x.total !== null || x.absent)) continue;
      exams.push({ examId: e.id, examName: e.name, date: e.createdAt, finalized: false, percentage: r.percentage, grade: r.grade, total: r.total, maxTotal: r.maxTotal, rank: null, rankedCount: 0, classAverage: null,
        subjects: rep.subjects.map((s, i) => ({ name: s.name, total: r.subjects[i].total, maxMarks: s.maxMarks, grade: r.subjects[i].grade, absent: !!r.subjects[i].absent, classAverage: null })) });
    }
    exams.sort((a, b) => new Date(a.date) - new Date(b.date));
    // Subject averages across exams → strongest / weakest
    const bySubject = new Map();
    exams.forEach((e) => e.subjects.forEach((s) => {
      if (s.total === null || !s.maxMarks) return;
      const k = s.name.trim().toUpperCase();
      const v = bySubject.get(k) || { name: s.name, sum: 0, n: 0 };
      v.sum += (s.total / s.maxMarks) * 100; v.n++; bySubject.set(k, v);
    }));
    const subjects = [...bySubject.values()].map((v) => ({ name: v.name, average: Math.round((v.sum / v.n) * 10) / 10, exams: v.n })).sort((a, b) => b.average - a.average);
    const pcts = exams.filter((e) => e.percentage !== null).map((e) => e.percentage);
    res.json({
      student: {
        tuitionStudentId: t.id, id: st.id, name: st.name, rollNumber: st.rollNumber, schoolClass: st.class.name, classTeacher: st.class.classTeacher?.name || null,
        fatherName: st.fatherName, parentPhone: st.parentPhone, address: st.address, tuitionClass: t.class.name, fee: feeOf(t), joinedOn: t.joinedOn,
      },
      payments: t.payments.map((p) => ({ month: p.month, amount: p.amount, paidOn: p.paidOn, mode: p.mode })),
      exams,
      subjects,
      passMark: passMark(),
      trend: pcts.length >= 2 ? Math.round((pcts[pcts.length - 1] - pcts[pcts.length - 2]) * 10) / 10 : null,
    });
  } catch (err) { fail(res, err); }
});

// ── Messages to chosen tuition students (e.g. from the fees analyser) also accept { type: 'owing' } ──

module.exports = router;
