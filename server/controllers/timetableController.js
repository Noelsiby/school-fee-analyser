/**
 * timetableController.js — periods, class timetables, clash check, teacher
 * timetables, "My periods today", and substitutions.
 *
 * Periods (Settings → Timetable) are set once by the admin: names, optional times,
 * and breaks. Each class's week is a grid of day × period → subject + teacher.
 */

const { PrismaClient } = require('@prisma/client');
const att = require('../lib/attendance');
const periodsLib = require('../lib/periods');

const prisma = new PrismaClient();
const isAdmin = (u) => (u.roles || []).includes('Admin');
const fail = (res, err) => { console.error('[timetable]', err); res.status(500).json({ error: err.message }); };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
/** "P3" → 3, for putting periods in order. */
const periodNumber = (key) => Number(String(key).replace(/[^0-9]/g, '')) || 99;

/** School days: every day except the weekly off days, Monday first. */
async function schoolDays() {
  const { weeklyOff } = await att.getSettings(prisma);
  return [1, 2, 3, 4, 5, 6, 0].filter((d) => !weeklyOff.includes(d)).map((d) => ({ day: d, name: DAY_NAMES[d] }));
}

const teachersList = () => prisma.user.findMany({
  where: { roles: { hasSome: ['ClassTeacher', 'SubjectTeacher'] } },
  select: { id: true, name: true },
  orderBy: { name: 'asc' },
});

/** Teachers placed in two classes in the same day + period. */
async function findClashes(filter = {}) {
  const entries = await prisma.timetableEntry.findMany({
    where: { teacherId: { not: null }, ...filter },
    include: { class: { select: { name: true } } },
  });
  const groups = new Map();
  for (const e of entries) {
    const k = `${e.teacherId}|${e.day}|${e.periodKey}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const teachers = new Map((await teachersList()).map((t) => [t.id, t.name]));
  return [...groups.values()].filter((g) => g.length > 1).map((g) => ({
    teacherId: g[0].teacherId,
    teacher: teachers.get(g[0].teacherId) || 'Unknown teacher',
    day: g[0].day,
    dayName: DAY_NAMES[g[0].day],
    periodKey: g[0].periodKey,
    classes: g.map((e) => e.class.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  }));
}

// ── GET /api/timetable/periods ── the school's period lists (none until the admin sets them)
exports.getPeriods = async (req, res) => {
  try {
    const schedules = await periodsLib.getSchedules(prisma);
    res.json({ schedules, days: await schoolDays(), saved: schedules.length > 0 });
  } catch (err) { fail(res, err); }
};

// ── PUT /api/timetable/periods  { schedules: [{ name, classIds, periods, dayCounts }] } ── admin
exports.savePeriods = async (req, res) => {
  const { schedules, error } = periodsLib.parseSchedules(req.body?.schedules);
  if (error) return res.status(400).json({ error });
  try {
    await prisma.appSetting.upsert({ where: { key: periodsLib.KEY }, create: { key: periodsLib.KEY, value: schedules }, update: { value: schedules } });
    // Remove timetable cells for periods a class no longer has (on that day)
    const entries = await prisma.timetableEntry.findMany({ select: { id: true, classId: true, day: true, periodKey: true } });
    const gone = entries.filter((e) => !periodsLib.periodsOf(periodsLib.scheduleFor(schedules, e.classId), e.day).some((p) => !p.isBreak && p.key === e.periodKey));
    if (gone.length) await prisma.timetableEntry.deleteMany({ where: { id: { in: gone.map((e) => e.id) } } });
    res.json({ schedules, removedCells: gone.length });
  } catch (err) { fail(res, err); }
};

// ── GET /api/timetable/classes/:classId ── one class's week, its subjects and teachers
exports.getClassTimetable = async (req, res) => {
  const classId = Number(req.params.classId);
  try {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: {
        name: true,
        classTeacherId: true,
        subjects: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
        teacherAssignments: { select: { subjectId: true, teacherId: true } },
      },
    });
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    const entries = await prisma.timetableEntry.findMany({ where: { classId } });
    const schedule = periodsLib.scheduleFor(await periodsLib.getSchedules(prisma), classId);
    res.json({
      className: cls.name,
      scheduleName: schedule?.name || null,
      periods: periodsLib.periodsOf(schedule),
      dayCounts: schedule?.dayCounts || {},
      days: await schoolDays(),
      subjects: cls.subjects.map((s) => ({ ...s, teacherIds: cls.teacherAssignments.filter((a) => a.subjectId === s.id).map((a) => a.teacherId) })),
      teachers: await teachersList(),
      entries: entries.map((e) => ({ day: e.day, periodKey: e.periodKey, subjectId: e.subjectId, teacherId: e.teacherId })),
      clashes: (await findClashes()).filter((c) => c.classes.includes(cls.name)),
    });
  } catch (err) { fail(res, err); }
};

// ── PUT /api/timetable/classes/:classId  { entries: [{ day, periodKey, subjectId, teacherId }] } ── admin
exports.saveClassTimetable = async (req, res) => {
  const classId = Number(req.params.classId);
  const list = Array.isArray(req.body?.entries) ? req.body.entries : [];
  try {
    const schedule = periodsLib.scheduleFor(await periodsLib.getSchedules(prisma), classId);
    const hasPeriod = (day, key) => periodsLib.periodsOf(schedule, day).some((p) => !p.isBreak && p.key === key);
    const days = (await schoolDays()).map((d) => d.day);
    const clean = list
      .map((e) => ({ day: Number(e.day), periodKey: String(e.periodKey), subjectId: Number(e.subjectId) || null, teacherId: Number(e.teacherId) || null }))
      .filter((e) => days.includes(e.day) && hasPeriod(e.day, e.periodKey) && (e.subjectId || e.teacherId));
    await prisma.$transaction([
      prisma.timetableEntry.deleteMany({ where: { classId } }),
      prisma.timetableEntry.createMany({ data: clean.map((e) => ({ classId, ...e })) }),
    ]);
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
    res.json({ saved: clean.length, clashes: (await findClashes()).filter((c) => c.classes.includes(cls.name)) });
  } catch (err) { fail(res, err); }
};

// ── POST /api/timetable/copy  { fromClassId, toClassIds } ── admin; subjects matched by name
exports.copyTimetable = async (req, res) => {
  const fromClassId = Number(req.body?.fromClassId);
  const toIds = [...new Set((req.body?.toClassIds || []).map(Number).filter((id) => id && id !== fromClassId))];
  if (!fromClassId || !toIds.length) return res.status(400).json({ error: 'Choose the classes to copy to.' });
  try {
    const source = await prisma.timetableEntry.findMany({ where: { classId: fromClassId } });
    const schedules = await periodsLib.getSchedules(prisma);
    const srcSubjects = new Map((await prisma.subject.findMany({ where: { classId: fromClassId } })).map((s) => [s.id, s.name.toLowerCase()]));
    const result = [];
    for (const toId of toIds) {
      const subs = await prisma.subject.findMany({ where: { classId: toId } });
      const assigns = await prisma.teacherSubjectAssignment.findMany({ where: { classId: toId } });
      const data = source.map((e) => {
        const name = srcSubjects.get(e.subjectId);
        const subject = subs.find((s) => s.name.toLowerCase() === name);
        // Keep the teacher only if they teach that subject in the target class
        const teacherOk = subject && assigns.some((a) => a.subjectId === subject.id && a.teacherId === e.teacherId);
        return { classId: toId, day: e.day, periodKey: e.periodKey, subjectId: subject?.id || null, teacherId: teacherOk ? e.teacherId : null };
      }).filter((e) => e.subjectId && periodsLib.periodsOf(periodsLib.scheduleFor(schedules, toId), e.day).some((p) => !p.isBreak && p.key === e.periodKey));
      await prisma.$transaction([
        prisma.timetableEntry.deleteMany({ where: { classId: toId } }),
        prisma.timetableEntry.createMany({ data }),
      ]);
      result.push({ classId: toId, copied: data.length, skipped: source.length - data.length });
    }
    res.json({ result });
  } catch (err) { fail(res, err); }
};

// ── GET /api/timetable/overview ── every class's week, plus all clashes (admin)
exports.overview = async (req, res) => {
  try {
    const classes = (await prisma.class.findMany({ select: { id: true, name: true } })).sort(byName);
    const entries = await prisma.timetableEntry.findMany();
    const subjects = new Map((await prisma.subject.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    const teachers = new Map((await teachersList()).map((t) => [t.id, t.name]));
    const schedules = await periodsLib.getSchedules(prisma);
    const days = await schoolDays();
    res.json({
      periods: periodsLib.allTeachingColumns(schedules),
      days,
      classes: classes.map((c) => ({
        ...c,
        // which periods this class has on each day (others show as "no period")
        dayKeys: Object.fromEntries(days.map((d) => [d.day, periodsLib.periodsOf(periodsLib.scheduleFor(schedules, c.id), d.day).filter((p) => !p.isBreak).map((p) => p.key)])),
        entries: entries.filter((e) => e.classId === c.id).map((e) => ({
          day: e.day, periodKey: e.periodKey, subject: subjects.get(e.subjectId) || null, teacher: teachers.get(e.teacherId) || null,
        })),
      })),
      clashes: await findClashes(),
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/timetable/teachers/:id ── one teacher's week (admin, or the teacher themself)
exports.teacherWeek = async (req, res) => {
  const id = req.params.id === 'me' ? req.user.userId : Number(req.params.id);
  if (!isAdmin(req.user) && id !== req.user.userId) return res.status(403).json({ error: 'Not allowed.' });
  try {
    const teacher = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });
    const entries = await prisma.timetableEntry.findMany({ where: { teacherId: id }, include: { class: { select: { name: true } } } });
    const subjects = new Map((await prisma.subject.findMany({ where: { id: { in: entries.map((e) => e.subjectId).filter(Boolean) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    res.json({
      teacher,
      periods: periodsLib.allTeachingColumns(await periodsLib.getSchedules(prisma)),
      days: await schoolDays(),
      entries: entries.map((e) => ({ day: e.day, periodKey: e.periodKey, className: e.class.name, classId: e.classId, subject: subjects.get(e.subjectId) || null })),
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/timetable/my-day?date= ── a teacher's periods on a day, with substitutions and attendance status
exports.myDay = async (req, res) => {
  const date = att.isDateStr(req.query.date) ? req.query.date : att.todayIST();
  const userId = req.user.userId;
  try {
    const day = att.weekday(date);
    const settings = await att.getSettings(prisma);
    const schedules = await periodsLib.getSchedules(prisma);
    const subs = await prisma.substitution.findMany({ where: { date: att.toDate(date) } });
    const own = await prisma.timetableEntry.findMany({ where: { teacherId: userId, day }, include: { class: { select: { name: true } } } });
    const covering = subs.filter((s) => s.substituteId === userId);
    const coveredEntries = covering.length ? await prisma.timetableEntry.findMany({
      where: { OR: covering.map((s) => ({ classId: s.classId, day, periodKey: s.periodKey })) },
      include: { class: { select: { name: true } } },
    }) : [];
    const subjects = new Map((await prisma.subject.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    const marked = await prisma.attendanceRecord.groupBy({ by: ['classId', 'slot'], where: { date: att.toDate(date) } });
    const isMarked = (classId, key) => marked.some((m) => m.classId === classId && m.slot === key);

    const rows = [];
    for (const e of own) {
      const handedOver = subs.find((s) => s.classId === e.classId && s.periodKey === e.periodKey && s.substituteId !== userId);
      rows.push({ periodKey: e.periodKey, classId: e.classId, className: e.class.name, subject: subjects.get(e.subjectId) || null, substitute: !!handedOver, covering: false });
    }
    for (const s of covering) {
      const e = coveredEntries.find((x) => x.classId === s.classId && x.periodKey === s.periodKey);
      const cls = e?.class.name || (await prisma.class.findUnique({ where: { id: s.classId }, select: { name: true } }))?.name;
      rows.push({ periodKey: s.periodKey, classId: s.classId, className: cls, subject: e ? subjects.get(e.subjectId) || null : null, substitute: false, covering: true });
    }
    rows.sort((a, b) => periodNumber(a.periodKey) - periodNumber(b.periodKey));
    res.json({
      date,
      dateLabel: att.prettyDate(date),
      mode: settings.mode,
      holiday: await prisma.holiday.findUnique({ where: { date: att.toDate(date) } }),
      weeklyOff: settings.weeklyOff.includes(day),
      periods: rows.map((r) => {
        const p = (periodsLib.scheduleFor(schedules, r.classId)?.periods || []).find((x) => x.key === r.periodKey);
        return { ...r, label: p?.label || r.periodKey, start: p?.start || null, end: p?.end || null, attendanceMarked: isMarked(r.classId, r.periodKey) };
      }),
    });
  } catch (err) { fail(res, err); }
};

// ── Substitutions (admin) ──

// GET /api/timetable/substitutions?date= ── the day's substitutions
exports.listSubstitutions = async (req, res) => {
  const date = att.isDateStr(req.query.date) ? req.query.date : att.todayIST();
  try {
    const subs = await prisma.substitution.findMany({ where: { date: att.toDate(date) } });
    const teachers = new Map((await teachersList()).map((t) => [t.id, t.name]));
    const classes = new Map((await prisma.class.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    const schedules = await periodsLib.getSchedules(prisma);
    res.json({
      date,
      substitutions: subs.map((s) => ({
        id: s.id, classId: s.classId, className: classes.get(s.classId), periodKey: s.periodKey,
        periodLabel: periodsLib.labelFor(schedules, s.classId, s.periodKey),
        absentTeacher: teachers.get(s.absentTeacherId) || null, substitute: teachers.get(s.substituteId) || null, note: s.note,
      })),
    });
  } catch (err) { fail(res, err); }
};

// GET /api/timetable/substitutions/plan?date=&teacherId= ── an absent teacher's periods + who is free
exports.planSubstitutions = async (req, res) => {
  const date = att.isDateStr(req.query.date) ? req.query.date : att.todayIST();
  const teacherId = Number(req.query.teacherId);
  try {
    const day = att.weekday(date);
    const schedules = await periodsLib.getSchedules(prisma);
    const own = await prisma.timetableEntry.findMany({ where: { teacherId, day }, include: { class: { select: { name: true } } } });
    const all = await prisma.timetableEntry.findMany({ where: { day, teacherId: { not: null } } });
    const subsToday = await prisma.substitution.findMany({ where: { date: att.toDate(date) } });
    const teachers = await teachersList();
    const subjects = new Map((await prisma.subject.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    const busy = (tid, key) => all.some((e) => e.teacherId === tid && e.periodKey === key) || subsToday.some((s) => s.substituteId === tid && s.periodKey === key);
    res.json({
      date,
      periods: own.sort((a, b) => periodNumber(a.periodKey) - periodNumber(b.periodKey)).map((e) => {
        const existing = subsToday.find((s) => s.classId === e.classId && s.periodKey === e.periodKey);
        return {
          classId: e.classId,
          className: e.class.name,
          periodKey: e.periodKey,
          periodLabel: periodsLib.labelFor(schedules, e.classId, e.periodKey),
          subject: subjects.get(e.subjectId) || null,
          substituteId: existing?.substituteId || null,
          free: teachers.filter((t) => t.id !== teacherId && !busy(t.id, e.periodKey)),
        };
      }),
    });
  } catch (err) { fail(res, err); }
};

// POST /api/timetable/substitutions  { date, classId, periodKey, substituteId, absentTeacherId, note? }
exports.saveSubstitution = async (req, res) => {
  const { date, periodKey, note } = req.body || {};
  const classId = Number(req.body?.classId);
  const substituteId = Number(req.body?.substituteId);
  const absentTeacherId = Number(req.body?.absentTeacherId) || null;
  if (!att.isDateStr(date) || !classId || !periodKey || !substituteId) return res.status(400).json({ error: 'Choose the period and the substitute teacher.' });
  try {
    const sub = await prisma.substitution.upsert({
      where: { date_classId_periodKey: { date: att.toDate(date), classId, periodKey } },
      create: { date: att.toDate(date), classId, periodKey, substituteId, absentTeacherId, note: note ? String(note).slice(0, 120) : null },
      update: { substituteId, absentTeacherId, note: note ? String(note).slice(0, 120) : null },
    });
    res.status(201).json({ substitution: sub });
  } catch (err) { fail(res, err); }
};

// DELETE /api/timetable/substitutions/:id
exports.deleteSubstitution = async (req, res) => {
  try {
    await prisma.substitution.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
};

exports.findClashes = findClashes;
