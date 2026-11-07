/**
 * attendanceController.js — taking attendance, today's status, monthly totals,
 * a student's attendance calendar, holidays, settings, and "Inform parents" on WhatsApp.
 *
 * Who can mark:
 *   Admin                          any class, any slot
 *   Class teacher                  their class, any slot
 *   Teacher of a period (periods)  that class and period, from the timetable or a substitution;
 *                                  if the class has no timetable yet, any teacher of the class
 */

const { PrismaClient } = require('@prisma/client');
const att = require('../lib/attendance');
const periodsLib = require('../lib/periods');
const wa = require('../lib/whatsapp');
const { byRoll } = require('../lib/rollOrder');

const prisma = new PrismaClient();
const isAdmin = (u) => (u.roles || []).includes('Admin');
const fail = (res, err) => { console.error('[attendance]', err); res.status(500).json({ error: err.message }); };
const SEND_GAP_MS = 400;

const isClassTeacherOf = async (user, classId) =>
  !!(await prisma.class.findFirst({ where: { id: classId, classTeacherId: user.userId }, select: { id: true } }));

/** May this user mark this class's attendance for this date and slot? */
async function canMark(user, classId, dateStr, slot, settings) {
  if (isAdmin(user) || (await isClassTeacherOf(user, classId))) return true;
  if (settings.mode !== 'periods') return false;
  const sub = await prisma.substitution.findUnique({ where: { date_classId_periodKey: { date: att.toDate(dateStr), classId, periodKey: slot } } });
  if (sub) return sub.substituteId === user.userId;
  const hasTimetable = await prisma.timetableEntry.count({ where: { classId } });
  if (hasTimetable) {
    return !!(await prisma.timetableEntry.findFirst({ where: { classId, day: att.weekday(dateStr), periodKey: slot, teacherId: user.userId } }));
  }
  return !!(await prisma.teacherSubjectAssignment.findFirst({ where: { classId, teacherId: user.userId } }));
}

/** May this user see this class's attendance? */
async function canView(user, classId) {
  if (isAdmin(user) || (await isClassTeacherOf(user, classId))) return true;
  return !!(await prisma.teacherSubjectAssignment.findFirst({ where: { classId, teacherId: user.userId } }))
    || !!(await prisma.timetableEntry.findFirst({ where: { classId, teacherId: user.userId } }));
}

async function holidayOn(dateStr) {
  return prisma.holiday.findUnique({ where: { date: att.toDate(dateStr) } });
}

// ── GET /api/attendance/settings ── mode, slots, weekly off days, holidays this academic year
exports.getSettings = async (req, res) => {
  try {
    const settings = await att.getSettings(prisma);
    const from = att.toDate(att.academicYearStart(att.todayIST()));
    const holidays = await prisma.holiday.findMany({ where: { date: { gte: from } }, orderBy: { date: 'asc' } });
    res.json({
      settings,
      periodsSet: (await periodsLib.getSchedules(prisma)).length > 0,
      today: att.todayIST(),
      holidays: holidays.map((h) => ({ id: h.id, date: att.ymd(h.date), name: h.name })),
    });
  } catch (err) { fail(res, err); }
};

// ── PUT /api/attendance/settings  { mode, weeklyOff, periodRule } ── admin
exports.updateSettings = async (req, res) => {
  const { mode, weeklyOff, periodRule } = req.body || {};
  if (!['daily', 'sessions', 'periods'].includes(mode)) return res.status(400).json({ error: 'Choose how attendance is taken.' });
  const days = Array.isArray(weeklyOff) ? [...new Set(weeklyOff.map(Number).filter((d) => d >= 0 && d <= 6))] : [0];
  const value = { mode, weeklyOff: days, periodRule: periodRule === 'fraction' ? 'fraction' : 'half' };
  try {
    if (mode === 'periods' && !(await periodsLib.getSchedules(prisma)).length) {
      return res.status(400).json({ error: "Set your school's periods first (Timetable → Periods), then choose “Every period”." });
    }
    await prisma.appSetting.upsert({ where: { key: att.ATTENDANCE_KEY }, create: { key: att.ATTENDANCE_KEY, value }, update: { value } });
    res.json({ settings: value });
  } catch (err) { fail(res, err); }
};

// ── POST /api/attendance/holidays  { date, name } ── admin
exports.addHoliday = async (req, res) => {
  const { date, name } = req.body || {};
  if (!att.isDateStr(date)) return res.status(400).json({ error: 'Choose a date.' });
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Give the holiday a name, e.g. Diwali.' });
  try {
    const h = await prisma.holiday.upsert({
      where: { date: att.toDate(date) },
      create: { date: att.toDate(date), name: String(name).trim().slice(0, 80) },
      update: { name: String(name).trim().slice(0, 80) },
    });
    res.status(201).json({ holiday: { id: h.id, date: att.ymd(h.date), name: h.name } });
  } catch (err) { fail(res, err); }
};

// ── DELETE /api/attendance/holidays/:id ── admin
exports.deleteHoliday = async (req, res) => {
  try {
    await prisma.holiday.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
};

// ── GET /api/attendance/classes ── classes this user can take or see attendance for
exports.myClasses = async (req, res) => {
  try {
    const settings = await att.getSettings(prisma);
    let where = {};
    if (!isAdmin(req.user)) {
      const or = [{ classTeacherId: req.user.userId }];
      if (settings.mode === 'periods') {
        or.push({ teacherAssignments: { some: { teacherId: req.user.userId } } }, { timetable: { some: { teacherId: req.user.userId } } });
      }
      where = { OR: or };
    }
    const classes = await prisma.class.findMany({ where, select: { id: true, name: true, classTeacherId: true, _count: { select: { students: true } } } });
    classes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    res.json({
      mode: settings.mode,
      classes: classes.map((c) => ({ id: c.id, name: c.name, students: c._count.students, isClassTeacher: c.classTeacherId === req.user.userId })),
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/attendance/classes/:classId?date=&slot= ── the register for one slot
exports.getRegister = async (req, res) => {
  const classId = Number(req.params.classId);
  const date = att.isDateStr(req.query.date) ? req.query.date : att.todayIST();
  try {
    if (!(await canView(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const settings = await att.getSettings(prisma);
    const slots = await att.slotsFor(prisma, settings.mode, classId, att.weekday(date));
    if (!slots.length) {
      return res.json({ noPeriods: true, date, dateLabel: att.prettyDate(date), mode: settings.mode, slots: [], students: [] });
    }
    const slot = slots.some((s) => s.key === req.query.slot) ? req.query.slot : slots[0].key;

    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true, students: { select: { id: true, name: true, rollNumber: true, parentPhone: true } } } });
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    const records = await prisma.attendanceRecord.findMany({ where: { classId, date: att.toDate(date) } });
    const here = records.filter((r) => r.slot === slot);
    const bySlot = Object.fromEntries(slots.map((s) => [s.key, records.filter((r) => r.slot === s.key).length > 0]));
    const alerts = await prisma.attendanceAlert.findMany({ where: { date: att.toDate(date), studentId: { in: cls.students.map((s) => s.id) } }, orderBy: { createdAt: 'desc' } });
    const latestAlert = new Map();
    for (const a of alerts) if (!latestAlert.has(a.studentId)) latestAlert.set(a.studentId, a);

    res.json({
      className: cls.name,
      date,
      dateLabel: att.prettyDate(date),
      isToday: date === att.todayIST(),
      mode: settings.mode,
      slot,
      slots: slots.map((s) => ({ ...s, marked: bySlot[s.key] })),
      holiday: await holidayOn(date),
      weeklyOff: settings.weeklyOff.includes(att.weekday(date)),
      canMark: await canMark(req.user, classId, date, slot, settings),
      marked: here.length > 0,
      waConfigured: wa.isConfigured(),
      students: [...cls.students].sort(byRoll).map((s) => {
        const r = here.find((x) => x.studentId === s.id);
        const dayRecs = records.filter((x) => x.studentId === s.id);
        const alert = latestAlert.get(s.id);
        return {
          id: s.id,
          name: s.name,
          rollNumber: s.rollNumber,
          hasPhone: !!wa.normalizePhone(s.parentPhone),
          status: r?.status || null,
          reason: r?.reason || null,
          // other slots of the day (for "absent in periods 5–7" and the day view)
          day: Object.fromEntries(dayRecs.map((x) => [x.slot, x.status])),
          alert: alert ? { status: alert.status, error: alert.error } : null,
        };
      }),
    });
  } catch (err) { fail(res, err); }
};

// ── PUT /api/attendance/classes/:classId  { date, slot, records: [{ studentId, status, reason? }] } ──
exports.saveRegister = async (req, res) => {
  const classId = Number(req.params.classId);
  const { date, slot } = req.body || {};
  const list = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!att.isDateStr(date)) return res.status(400).json({ error: 'Choose a date.' });
  if (date > att.todayIST()) return res.status(400).json({ error: "Attendance can't be taken for a future date." });
  try {
    const settings = await att.getSettings(prisma);
    const slots = await att.slotsFor(prisma, settings.mode, classId, att.weekday(date));
    if (!slots.some((s) => s.key === slot)) return res.status(400).json({ error: "That period isn't part of this class's day." });
    if (!(await canMark(req.user, classId, date, slot, settings))) {
      return res.status(403).json({ error: settings.mode === 'periods' ? "This period isn't yours in the timetable." : 'Only the class teacher (or the admin) can take attendance for this class.' });
    }
    if (await holidayOn(date)) return res.status(400).json({ error: 'That day is a holiday.' });

    const students = await prisma.student.findMany({ where: { classId }, select: { id: true } });
    const given = new Map(list.map((r) => [Number(r.studentId), r]));
    const ops = students.map((s) => {
      const r = given.get(s.id);
      const status = att.STATUSES.includes(r?.status) ? r.status : 'P'; // anyone not listed is present
      const reason = (status === 'A' || status === 'L') && r?.reason ? String(r.reason).slice(0, 120) : null;
      return prisma.attendanceRecord.upsert({
        where: { studentId_date_slot: { studentId: s.id, date: att.toDate(date), slot } },
        create: { studentId: s.id, classId, date: att.toDate(date), slot, status, reason, markedById: req.user.userId },
        update: { status, reason, classId, markedById: req.user.userId },
      });
    });
    await prisma.$transaction(ops);
    const absent = [...given.values()].filter((r) => r.status === 'A').length;
    res.json({ saved: students.length, absent });
  } catch (err) { fail(res, err); }
};

// ── GET /api/attendance/today?date= ── every class's status for a day (admin dashboard)
exports.dayOverview = async (req, res) => {
  const date = att.isDateStr(req.query.date) ? req.query.date : att.todayIST();
  try {
    const settings = await att.getSettings(prisma);
    const where = isAdmin(req.user) ? {} : { classTeacherId: req.user.userId };
    const classes = await prisma.class.findMany({ where, select: { id: true, name: true, _count: { select: { students: true } } } });
    const records = await prisma.attendanceRecord.findMany({ where: { date: att.toDate(date), classId: { in: classes.map((c) => c.id) } } });
    const holiday = await holidayOn(date);

    const schedules = await periodsLib.getSchedules(prisma);
    const slotsOf = (classId) => (settings.mode === 'periods'
      ? periodsLib.periodsOf(periodsLib.scheduleFor(schedules, classId), att.weekday(date)).filter((p) => !p.isBreak).map((p) => ({ key: p.key }))
      : settings.mode === 'sessions' ? [{ key: 'FN' }, { key: 'AN' }] : [{ key: 'DAY' }]);
    const rows = classes.map((c) => {
      const slots = slotsOf(c.id);
      const recs = records.filter((r) => r.classId === c.id);
      const slotsMarked = slots.filter((s) => recs.some((r) => r.slot === s.key)).length;
      const t = att.totals(recs, settings.mode, settings.periodRule);
      const studentsTaken = Object.keys(t).length;
      const present = Object.values(t).reduce((m, v) => m + (v.present >= v.days ? 1 : 0), 0);
      const absentNow = slots.length ? recs.filter((r) => r.slot === slots[0].key && r.status === 'A').length : 0;
      return {
        id: c.id,
        name: c.name,
        students: c._count.students,
        slotsMarked,
        slotsTotal: slots.length,
        marked: slotsMarked > 0,
        present: studentsTaken ? present : null,
        absent: studentsTaken ? studentsTaken - present : null,
        absentFirstSlot: absentNow,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    res.json({
      date,
      dateLabel: att.prettyDate(date),
      mode: settings.mode,
      holiday,
      weeklyOff: settings.weeklyOff.includes(att.weekday(date)),
      classes: rows,
      summary: {
        marked: rows.filter((r) => r.marked).length,
        classes: rows.length,
        present: rows.reduce((m, r) => m + (r.present || 0), 0),
        absent: rows.reduce((m, r) => m + (r.absent || 0), 0),
      },
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/attendance/classes/:classId/summary?from=&to= ── each student's attendance % (default: this month)
exports.classSummary = async (req, res) => {
  const classId = Number(req.params.classId);
  const today = att.todayIST();
  const from = att.isDateStr(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
  const to = att.isDateStr(req.query.to) ? req.query.to : today;
  try {
    if (!(await canView(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const settings = await att.getSettings(prisma);
    const students = await prisma.student.findMany({ where: { classId }, select: { id: true, name: true, rollNumber: true } });
    const records = await prisma.attendanceRecord.findMany({ where: { classId, date: { gte: att.toDate(from), lte: att.toDate(to) } } });
    const t = att.totals(records, settings.mode, settings.periodRule);
    const days = new Set(records.map((r) => att.ymd(r.date))).size;
    res.json({
      from, to, daysTaken: days,
      students: students.sort(byRoll).map((s) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber, ...(t[s.id] || { days: 0, present: 0, percent: null }) })),
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/attendance/students/:id?month=YYYY-MM ── one student's calendar + totals
exports.studentCalendar = async (req, res) => {
  const id = Number(req.params.id);
  const today = att.todayIST();
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : today.slice(0, 7);
  try {
    const student = await prisma.student.findUnique({ where: { id }, select: { classId: true } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    if (!(await canView(req.user, student.classId))) return res.status(403).json({ error: 'Not your class.' });
    const settings = await att.getSettings(prisma);
    const first = `${month}-01`;
    const last = att.ymd(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
    const yearFrom = att.academicYearStart(today);

    const [monthRecs, yearRecs, holidays] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { studentId: id, date: { gte: att.toDate(first), lte: att.toDate(last) } } }),
      prisma.attendanceRecord.findMany({ where: { studentId: id, date: { gte: att.toDate(yearFrom), lte: att.toDate(today) } } }),
      prisma.holiday.findMany({ where: { date: { gte: att.toDate(first), lte: att.toDate(last) } } }),
    ]);
    const days = [];
    for (let d = att.toDate(first); att.ymd(d) <= last; d = new Date(d.getTime() + 864e5)) {
      const key = att.ymd(d);
      const recs = monthRecs.filter((r) => att.ymd(r.date) === key);
      const h = holidays.find((x) => att.ymd(x.date) === key);
      const p = att.dayPresence(recs, settings.mode, settings.periodRule);
      days.push({
        date: key,
        weekday: d.getUTCDay(),
        holiday: h?.name || null,
        weeklyOff: settings.weeklyOff.includes(d.getUTCDay()),
        taken: recs.length > 0,
        // full / half / absent / leave for colouring
        state: !recs.length ? null : p.present >= p.days ? 'present' : p.present > 0 ? 'partial' : recs.every((r) => r.status === 'L') ? 'leave' : 'absent',
        slots: Object.fromEntries(recs.map((r) => [r.slot, r.status])),
        reason: recs.find((r) => r.reason)?.reason || null,
      });
    }
    res.json({
      month,
      mode: settings.mode,
      days,
      monthTotal: att.totals(monthRecs, settings.mode, settings.periodRule)[id] || { days: 0, present: 0, percent: null },
      yearTotal: att.totals(yearRecs, settings.mode, settings.periodRule)[id] || { days: 0, present: 0, percent: null },
      yearFrom,
    });
  } catch (err) { fail(res, err); }
};

/** "today", "in the afternoon", "in periods 5–7", from a student's records that day. */
function whenText(daySlots, mode, slots, isToday) {
  const base = isToday ? 'today' : 'on this day';
  if (mode === 'sessions') {
    const fn = daySlots.FN === 'A', an = daySlots.AN === 'A';
    if (fn && !an && daySlots.AN) return `in the morning ${base}`;
    if (an && !fn && daySlots.FN) return `in the afternoon ${base}`;
    return base;
  }
  if (mode === 'periods') {
    const taken = slots.filter((s) => daySlots[s.key]);
    const missed = taken.filter((s) => daySlots[s.key] === 'A');
    if (!missed.length || missed.length === taken.length) return base;
    const nums = missed.map((s) => s.label.replace(/^Period\s*/i, '')).join(', ');
    return `in ${missed.length === 1 ? 'period' : 'periods'} ${nums} ${base}`;
  }
  return base;
}

// ── POST /api/attendance/alerts  { classId, date, studentIds } ── WhatsApp parents of absent students
exports.sendAlerts = async (req, res) => {
  const classId = Number(req.body?.classId);
  const date = req.body?.date;
  const ids = [...new Set((req.body?.studentIds || []).map(Number).filter(Number.isInteger))];
  if (!att.isDateStr(date) || !ids.length) return res.status(400).json({ error: 'Choose the students to inform.' });
  if (!wa.isConfigured()) return res.status(503).json({ error: 'WhatsApp is not set up yet. Add RICHAUTOMATE_API_KEY in Render → Environment.' });
  try {
    if (!isAdmin(req.user) && !(await isClassTeacherOf(req.user, classId))) {
      return res.status(403).json({ error: 'Only the class teacher (or the admin) can inform parents.' });
    }
    const settings = await att.getSettings(prisma);
    const slots = await att.slotsFor(prisma, settings.mode, classId, att.weekday(date));
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
    const students = await prisma.student.findMany({ where: { id: { in: ids }, classId }, select: { id: true, name: true, parentPhone: true } });
    const records = await prisma.attendanceRecord.findMany({ where: { classId, date: att.toDate(date), studentId: { in: ids } } });

    const skipped = [];
    const queued = [];
    for (const s of students) {
      const phone = wa.normalizePhone(s.parentPhone);
      const daySlots = Object.fromEntries(records.filter((r) => r.studentId === s.id).map((r) => [r.slot, r.status]));
      if (!Object.values(daySlots).includes('A')) {
        skipped.push({ id: s.id, name: s.name, reason: Object.values(daySlots).includes('L') ? 'On leave' : 'Not marked absent' });
        continue;
      }
      if (!phone) { skipped.push({ id: s.id, name: s.name, reason: 'No valid parent number' }); continue; }
      const row = await prisma.attendanceAlert.create({ data: { studentId: s.id, date: att.toDate(date), phone, sentById: req.user.userId } });
      queued.push({ row, vars: [s.name, cls.name, att.prettyDate(date), whenText(daySlots, settings.mode, slots, date === att.todayIST())] });
    }
    res.json({ queued: queued.length, skipped });

    (async () => {
      for (const { row, vars } of queued) {
        try {
          const providerMessageId = await wa.sendAbsenceTemplate(row.phone, vars);
          await prisma.attendanceAlert.update({ where: { id: row.id }, data: { status: 'sent', providerMessageId } });
        } catch (e) {
          await prisma.attendanceAlert.update({ where: { id: row.id }, data: { status: 'failed', error: e.message.slice(0, 500) } });
        }
        await new Promise((r) => setTimeout(r, SEND_GAP_MS));
      }
    })().catch((e) => console.error('[attendance] alert loop', e));
  } catch (err) {
    if (!res.headersSent) fail(res, err);
  }
};

exports.canView = canView;
exports.whenText = whenText;
