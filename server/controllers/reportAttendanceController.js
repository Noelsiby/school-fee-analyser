/**
 * reportAttendanceController.js — "Report card attendance" (Admin → Classes → Reports, the class
 * teacher's dashboard, and each exam on a student's profile). Admin: any class; class teacher: own class.
 * For one exam and one class the admin types the working days once and each student's
 * days present. The report card then shows "Working days / Days present / %".
 *
 * GET /api/students/report-attendance?examId=&classId=
 * PUT /api/students/report-attendance { examId, classId, workingDays, records: [{ studentId, present }] }
 *     workingDays empty → clears this exam's attendance for the class; present empty → clears that student.
 */


const { byRoll } = require('../lib/rollOrder');
const { canAccessClass } = require('./studentController');

const prisma = require('../lib/prisma'); // shared, small pool
const fail = (res, err) => { console.error('[report-attendance]', err); res.status(500).json({ error: err.message }); };
const MAX_DAYS = 366;

/** The exam if this class takes part in it, else null. */
async function examForClass(examId, classId) {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, name: true, classId: true } });
  if (!exam) return null;
  if (exam.classId === classId) return exam;
  const enrolled = await prisma.examClassEnrollment.findFirst({ where: { examId, classId } });
  return enrolled ? exam : null;
}

const ids = (q) => ({ examId: Number(q.examId), classId: Number(q.classId) });
const blank = (v) => v === null || v === undefined || String(v).trim() === '';

exports.get = async (req, res) => {
  const { examId, classId } = ids(req.query);
  if (!examId || !classId) return res.status(400).json({ error: 'Choose an exam and a class.' });
  try {
    if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const exam = await examForClass(examId, classId);
    if (!exam) return res.status(404).json({ error: 'This class is not part of that exam.' });
    const [days, students] = await Promise.all([
      prisma.examAttendanceDays.findUnique({ where: { examId_classId: { examId, classId } } }),
      prisma.student.findMany({ where: { classId }, select: { id: true, name: true, rollNumber: true } }),
    ]);
    const rows = await prisma.examAttendance.findMany({ where: { examId, studentId: { in: students.map((s) => s.id) } } });
    const present = new Map(rows.map((r) => [r.studentId, r.present]));
    res.json({
      exam: { id: exam.id, name: exam.name },
      workingDays: days?.workingDays ?? null,
      students: students.sort(byRoll).map((s) => ({ ...s, present: present.has(s.id) ? present.get(s.id) : null })),
    });
  } catch (err) { fail(res, err); }
};

exports.save = async (req, res) => {
  const { examId, classId } = ids(req.body || {});
  if (!examId || !classId) return res.status(400).json({ error: 'Choose an exam and a class.' });
  const records = Array.isArray(req.body.records) ? req.body.records : [];
  try {
    if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const exam = await examForClass(examId, classId);
    if (!exam) return res.status(404).json({ error: 'This class is not part of that exam.' });
    const classIds = new Set((await prisma.student.findMany({ where: { classId }, select: { id: true } })).map((s) => s.id));

    // No working days → clear everything for this exam and class
    if (blank(req.body.workingDays)) {
      await prisma.$transaction([
        prisma.examAttendanceDays.deleteMany({ where: { examId, classId } }),
        prisma.examAttendance.deleteMany({ where: { examId, studentId: { in: [...classIds] } } }),
      ]);
      return res.json({ cleared: true, saved: 0 });
    }

    const workingDays = Number(req.body.workingDays);
    if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > MAX_DAYS) {
      return res.status(400).json({ error: `Working days must be a whole number from 1 to ${MAX_DAYS}.` });
    }
    const toSave = [], toClear = [], problems = [];
    for (const r of records) {
      const studentId = Number(r.studentId);
      if (!classIds.has(studentId)) continue;
      if (blank(r.present)) { toClear.push(studentId); continue; }
      const present = Number(r.present);
      if (!Number.isInteger(present) || present < 0 || present > workingDays) problems.push(studentId);
      else toSave.push({ studentId, present });
    }
    if (problems.length) {
      const names = (await prisma.student.findMany({ where: { id: { in: problems } }, select: { name: true } })).map((s) => s.name);
      return res.status(400).json({ error: `Days present must be from 0 to ${workingDays}: check ${names.join(', ')}.`, studentIds: problems });
    }

    await prisma.$transaction([
      prisma.examAttendanceDays.upsert({
        where: { examId_classId: { examId, classId } },
        create: { examId, classId, workingDays },
        update: { workingDays },
      }),
      ...(toClear.length ? [prisma.examAttendance.deleteMany({ where: { examId, studentId: { in: toClear } } })] : []),
      ...toSave.map(({ studentId, present }) => prisma.examAttendance.upsert({
        where: { examId_studentId: { examId, studentId } },
        create: { examId, studentId, present },
        update: { present },
      })),
    ]);
    res.json({ saved: toSave.length, cleared: toClear.length });
  } catch (err) { fail(res, err); }
};
