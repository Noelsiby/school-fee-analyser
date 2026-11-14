/**
 * appController.js — the Student App (for parents). Every route under /api/app
 * except activate/login needs a parent token, and every child route checks that
 * the child belongs to that parent's phone number.
 *
 * What parents see: published exam results, progress (without staff-only warning
 * flags and teacher notes), attendance, timetable, school notices and the profile
 * (Aadhaar/APAAR masked). Never other students' details.
 */

const { PrismaClient } = require('@prisma/client');
const pa = require('../lib/parentAuth');
const { analyse } = require('../lib/performance');
const { passMark } = require('../lib/grades');
const periodsLib = require('../lib/periods');
const att = require('../lib/attendance');
const { calendarFor } = require('./attendanceController');

const prisma = new PrismaClient();
const fail = (res, err) => { console.error('[app]', err); res.status(500).json({ error: 'Something went wrong. Please try again.' }); };
const mask = (v) => (v ? `XXXX XXXX ${String(v).replace(/\s/g, '').slice(-4)}` : null);
const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// ── POST /api/app/activate  { phone, code, pin } ── first time: prove the number, choose a PIN
exports.activate = async (req, res) => {
  const phone = pa.normalizePhone(req.body?.phone);
  const code = String(req.body?.code || '').replace(/\s/g, '');
  const pin = String(req.body?.pin || '');
  if (!phone) return res.status(400).json({ error: 'Enter the parent mobile number the school has (10 digits).' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit activation code from the school.' });
  if (!pa.isPin(pin)) return res.status(400).json({ error: 'Choose a 4-digit PIN.' });
  try {
    const account = await prisma.parentAccount.findUnique({ where: { phone } });
    if (!account || !account.codeHash) return res.status(400).json({ error: 'No activation code for this number. Please ask the school for one.' });
    if (pa.isLocked(account)) return res.status(429).json({ error: pa.lockedMessage(account) });
    if (account.codeExpires && new Date(account.codeExpires) < new Date()) {
      return res.status(400).json({ error: 'This activation code has expired. Please ask the school for a new one.' });
    }
    if (!(await pa.matches(code, account.codeHash))) {
      const left = await pa.recordFailure(prisma, account);
      return res.status(400).json({ error: left > 0 ? `Wrong code. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : 'Too many wrong tries. Please wait 15 minutes.' });
    }
    const children = await pa.childrenOf(prisma, phone);
    if (!children.length) return res.status(400).json({ error: "This number isn't linked to any student now. Please contact the school." });
    const updated = await prisma.parentAccount.update({
      where: { id: account.id },
      data: { pinHash: await pa.hash(pin), codeHash: null, codeExpires: null, activatedAt: new Date(), lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null },
    });
    res.json({ token: pa.signToken(updated), phone: pa.displayPhone(phone), children });
  } catch (err) { fail(res, err); }
};

// ── POST /api/app/login  { phone, pin } ──
exports.login = async (req, res) => {
  const phone = pa.normalizePhone(req.body?.phone);
  const pin = String(req.body?.pin || '');
  if (!phone || !pa.isPin(pin)) return res.status(400).json({ error: 'Enter your mobile number and 4-digit PIN.' });
  try {
    const account = await prisma.parentAccount.findUnique({ where: { phone } });
    if (!account || !account.pinHash) {
      return res.status(400).json({ error: 'This number is not set up yet. Use “First time? Activate” with the code from the school.' });
    }
    if (pa.isLocked(account)) return res.status(429).json({ error: pa.lockedMessage(account) });
    if (!(await pa.matches(pin, account.pinHash))) {
      const left = await pa.recordFailure(prisma, account);
      return res.status(400).json({ error: left > 0 ? `Wrong PIN. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : 'Too many wrong tries. Please wait 15 minutes.' });
    }
    const updated = await prisma.parentAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null } });
    res.json({ token: pa.signToken(updated), phone: pa.displayPhone(phone), children: await pa.childrenOf(prisma, phone) });
  } catch (err) { fail(res, err); }
};

// ── GET /api/app/me ── the parent's children (brothers and sisters)
exports.me = async (req, res) => {
  try {
    res.json({ phone: pa.displayPhone(req.parent.phone), children: await pa.childrenOf(prisma, req.parent.phone) });
  } catch (err) { fail(res, err); }
};

/** Middleware: the :childId must be one of this parent's children. */
exports.ownChild = async (req, res, next) => {
  try {
    const children = await pa.childrenOf(prisma, req.parent.phone);
    const child = children.find((c) => c.id === Number(req.params.childId));
    if (!child) return res.status(404).json({ error: 'Student not found.' });
    req.child = child;
    next();
  } catch (err) { fail(res, err); }
};

/** The child's saved results for exams the school has published. */
async function publishedSnapshots(studentId) {
  const snaps = await prisma.resultSnapshot.findMany({ where: { studentId }, orderBy: { examDate: 'asc' } });
  if (!snaps.length) return [];
  const published = new Set((await prisma.exam.findMany({
    where: { id: { in: snaps.map((s) => s.examId) }, isPublished: true }, select: { id: true },
  })).map((e) => e.id));
  return snaps.filter((s) => published.has(s.examId));
}

/** Notices sent to the whole school, the child's class, or the child. */
async function noticesFor(child, take = 50) {
  const all = await prisma.notice.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  return all.filter((n) => {
    const a = n.audience || {};
    return a.type === 'school'
      || (a.type === 'classes' && (a.classIds || []).includes(child.classId))
      || (a.type === 'students' && (a.studentIds || []).includes(child.id));
  }).slice(0, take).map((n) => ({ id: n.id, title: n.title, body: n.body, date: n.createdAt }));
}

const resultOf = (s) => ({
  examId: s.examId,
  examName: s.examName,
  date: isoDate(s.examDate),
  total: s.total,
  maxTotal: s.maxTotal,
  percentage: s.percentage,
  grade: s.grade,
  gpa: s.gpa,
  rank: s.rank,
  rankedCount: s.rankedCount,
  classAverage: s.classAverage,
  complete: s.complete,
  subjects: (s.subjects || []).map((x) => ({
    name: x.name, total: x.total, maxMarks: x.maxMarks, grade: x.grade, points: x.points,
    parts: x.parts ? Object.fromEntries(Object.entries(x.parts).filter(([k]) => k !== 'Main' && x.partMax?.[k] !== undefined)) : null,
    main: x.parts?.Main ?? null,
    partMax: x.partMax || null,
  })),
});

// ── GET /api/app/children/:childId/home ── a quick summary for the home screen
exports.home = async (req, res) => {
  try {
    const c = req.child;
    const snaps = await publishedSnapshots(c.id);
    const latest = [...snaps].reverse().find((s) => s.complete) || null;
    const today = att.todayIST();
    const cal = await calendarFor(c.id, today.slice(0, 7));
    const todayInfo = cal.days.find((d) => d.date === today);
    res.json({
      child: c,
      latestResult: latest ? resultOf(latest) : null,
      today: {
        date: today,
        dateLabel: att.prettyDate(today),
        holiday: todayInfo?.holiday || null,
        weeklyOff: !!todayInfo?.weeklyOff,
        attendance: todayInfo?.state || null, // present | absent | partial | leave | null (not taken yet)
      },
      attendanceThisYear: cal.yearTotal,
      notices: await noticesFor(c, 3),
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/app/children/:childId/results ──
exports.results = async (req, res) => {
  try {
    const snaps = await publishedSnapshots(req.child.id);
    res.json({ passMark: passMark(), results: snaps.reverse().map(resultOf) });
  } catch (err) { fail(res, err); }
};

// ── GET /api/app/children/:childId/progress ── the analysis, without staff-only warnings
exports.progress = async (req, res) => {
  try {
    const snaps = await publishedSnapshots(req.child.id);
    const a = analyse(snaps.map((s) => ({ ...s, studentId: req.child.id })));
    delete a.flags; // "needs attention" warnings are for the school, not shown in the app
    res.json(a);
  } catch (err) { fail(res, err); }
};

// ── GET /api/app/children/:childId/attendance?month=YYYY-MM ──
exports.attendance = async (req, res) => {
  try {
    res.json(await calendarFor(req.child.id, req.query.month));
  } catch (err) { fail(res, err); }
};

// ── GET /api/app/children/:childId/timetable ── the class's week
exports.timetable = async (req, res) => {
  try {
    const classId = req.child.classId;
    const schedule = periodsLib.scheduleFor(await periodsLib.getSchedules(prisma), classId);
    const { weeklyOff } = await att.getSettings(prisma);
    const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => !weeklyOff.includes(d)).map((d) => ({ day: d, name: DAY[d] }));
    const entries = await prisma.timetableEntry.findMany({ where: { classId } });
    const subjects = new Map((await prisma.subject.findMany({ where: { classId }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    const teachers = new Map((await prisma.user.findMany({ where: { id: { in: entries.map((e) => e.teacherId).filter(Boolean) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    res.json({
      today: att.weekday(att.todayIST()),
      days: days.map((d) => ({
        ...d,
        periods: periodsLib.periodsOf(schedule, d.day).map((p) => {
          const e = entries.find((x) => x.day === d.day && x.periodKey === p.key);
          return { key: p.key, label: p.label, start: p.start, end: p.end, isBreak: p.isBreak, subject: subjects.get(e?.subjectId) || null, teacher: teachers.get(e?.teacherId) || null };
        }),
      })),
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/app/children/:childId/notices ──
exports.notices = async (req, res) => {
  try { res.json({ notices: await noticesFor(req.child) }); } catch (err) { fail(res, err); }
};

// ── GET /api/app/children/:childId/profile ── read-only bio data
exports.profile = async (req, res) => {
  try {
    const s = await prisma.student.findUnique({ where: { id: req.child.id }, include: { class: { select: { name: true, classTeacher: { select: { name: true } } } } } });
    res.json({
      name: s.name, rollNumber: s.rollNumber, className: s.class.name, classTeacher: s.class.classTeacher?.name || null,
      fatherName: s.fatherName, section: s.section, admissionNo: s.admissionNo,
      admissionDate: isoDate(s.admissionDate), dateOfBirth: isoDate(s.dateOfBirth), bloodGroup: s.bloodGroup,
      idMark1: s.idMark1, idMark2: s.idMark2, address: s.address,
      aadhaarNo: mask(s.aadhaarNo), apaarNo: mask(s.apaarNo), phoneRes: s.phoneRes, parentPhone: s.parentPhone,
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/app/children/:childId/photo ──
exports.photo = async (req, res) => {
  try {
    const p = await prisma.studentPhoto.findUnique({ where: { studentId: req.child.id } });
    if (!p) return res.status(404).json({ error: 'No photo.' });
    res.set('Content-Type', p.mimeType).set('Cache-Control', 'private, max-age=3600').send(Buffer.from(p.data));
  } catch (err) { fail(res, err); }
};
