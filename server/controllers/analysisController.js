/**
 * analysisController.js — the Performance Analyser:
 *   student performance + teacher notes, class analyser, exam comparison,
 *   remedial groups, and the subject teacher's "weak students" view.
 * Admin sees every class; a class teacher their own class; a subject teacher the
 * classes and subjects they teach.
 */

const { PrismaClient } = require('@prisma/client');
const { canAccessClass } = require('./studentController');
const { classRows } = require('../lib/snapshots');
const { analyse, classGains, notesWithFollowUp, pctOf, round1 } = require('../lib/performance');
const { passMark } = require('../lib/grades');
const { byRoll } = require('../lib/rollOrder');

const prisma = new PrismaClient();

const isAdmin = (u) => (u.roles || []).includes('Admin');
const fail = (res, err) => { console.error('[analysis]', err); res.status(500).json({ error: err.message }); };

/** Can this user see this class? Admin, its class teacher, or a teacher of one of its subjects. */
async function canSeeClass(user, classId) {
  if (await canAccessClass(user, classId)) return true;
  return !!(await prisma.teacherSubjectAssignment.findFirst({ where: { teacherId: user.userId, classId } }));
}

/** Exams of a class for the analyser: live exams plus results kept from deleted exams, newest first. */
async function examsForClass(classId) {
  const live = await prisma.exam.findMany({
    where: { status: { in: ['Open', 'Closed'] }, OR: [{ classId }, { enrollments: { some: { classId } } }] },
    include: { enrollments: { where: { classId } } },
  });
  const saved = await prisma.resultSnapshot.groupBy({
    by: ['examId', 'examName', 'examDate'],
    where: { classId },
  });
  const map = new Map();
  for (const e of live) {
    const finalized = e.status === 'Closed' || e.enrollments.some((x) => x.status === 'Finalized');
    map.set(e.id, { id: e.id, name: e.name, date: e.createdAt, finalized, deleted: false });
  }
  for (const s of saved) {
    if (!map.has(s.examId)) map.set(s.examId, { id: s.examId, name: s.examName, date: s.examDate, finalized: true, deleted: true });
  }
  return [...map.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ── GET /api/analysis/students/:id ── one student's performance + notes
exports.studentPerformance = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const student = await prisma.student.findUnique({ where: { id }, select: { id: true, name: true, rollNumber: true, classId: true, class: { select: { name: true } } } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    if (!(await canAccessClass(req.user, student.classId))) return res.status(403).json({ error: 'You can only view students of your own class.' });

    const snaps = await prisma.resultSnapshot.findMany({ where: { studentId: id }, orderBy: { examDate: 'asc' } });
    const latest = [...snaps].reverse().find((s) => s.complete);
    const gains = latest ? await classGains(prisma, latest.classId, latest.examId) : null;
    const analysis = analyse(snaps.map((s) => ({ ...s, studentId: id })), { classGains: gains });
    const notes = await prisma.studentNote.findMany({ where: { studentId: id }, orderBy: { createdAt: 'desc' } });

    res.json({
      student: { id: student.id, name: student.name, rollNumber: student.rollNumber, className: student.class.name },
      analysis,
      notes: notesWithFollowUp(notes, snaps),
      canDeleteAnyNote: isAdmin(req.user),
    });
  } catch (err) { fail(res, err); }
};

// ── POST /api/analysis/students/:id/notes  { subject?, text } ──
exports.addNote = async (req, res) => {
  const id = Number(req.params.id);
  const text = String(req.body?.text || '').trim();
  const subject = String(req.body?.subject || '').trim() || null;
  if (!text) return res.status(400).json({ error: 'Write the note first.' });
  if (text.length > 500) return res.status(400).json({ error: 'Keep the note under 500 characters.' });
  try {
    const student = await prisma.student.findUnique({ where: { id }, select: { classId: true } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    if (!(await canAccessClass(req.user, student.classId))) return res.status(403).json({ error: 'Not your class.' });
    const note = await prisma.studentNote.create({
      data: { studentId: id, subject, text, authorId: req.user.userId, authorName: req.user.name || 'Teacher' },
    });
    res.status(201).json({ note });
  } catch (err) { fail(res, err); }
};

// ── DELETE /api/analysis/notes/:noteId ── the author or an admin
exports.deleteNote = async (req, res) => {
  try {
    const note = await prisma.studentNote.findUnique({ where: { id: Number(req.params.noteId) } });
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    if (!isAdmin(req.user) && note.authorId !== req.user.userId) return res.status(403).json({ error: 'Only the teacher who wrote it (or the admin) can delete this note.' });
    await prisma.studentNote.delete({ where: { id: note.id } });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
};

// ── GET /api/analysis/classes/:classId/exams ──
exports.classExams = async (req, res) => {
  const classId = Number(req.params.classId);
  try {
    if (!(await canSeeClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    res.json({ exams: await examsForClass(classId) });
  } catch (err) { fail(res, err); }
};

/** Each student's previous result (before this exam) for "most improved" / "dropped". */
async function previousOf(rows) {
  const prev = new Map();
  for (const r of rows) {
    const p = await prisma.resultSnapshot.findFirst({
      where: { studentId: r.studentId, examId: { not: r.examId }, examDate: { lt: r.examDate }, complete: true },
      orderBy: { examDate: 'desc' },
    });
    if (p) prev.set(r.studentId, p);
  }
  return prev;
}

const isBoardClass = (name) => /(^|\D)10(\D|$)|\bX\b/i.test(name);

// ── GET /api/analysis/classes/:classId/exams/:examId ── the Class Analyser
exports.classAnalysis = async (req, res) => {
  const classId = Number(req.params.classId);
  const examId = Number(req.params.examId);
  try {
    if (!(await canSeeClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const rows = (await classRows(prisma, examId, classId)).sort(byRoll);
    if (!rows.length) return res.json({ empty: true });
    const pass = passMark();
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });

    const subjectNames = rows[0].subjects.map((s) => s.name);
    const subjects = subjectNames.map((name) => {
      const entries = rows.map((r) => r.subjects.find((s) => s.name === name)).filter((s) => s && s.total !== null);
      const max = entries[0]?.maxMarks || rows[0].subjects.find((s) => s.name === name)?.maxMarks;
      const pcts = entries.map((s) => pctOf(s.total, s.maxMarks));
      const grades = {};
      entries.forEach((s) => { grades[s.grade] = (grades[s.grade] || 0) + 1; });
      return {
        name,
        maxMarks: max,
        entered: entries.length,
        average: entries.length ? round1(entries.reduce((a, s) => a + s.total, 0) / entries.length) : null,
        averagePct: pcts.length ? round1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
        highest: entries.length ? Math.max(...entries.map((s) => s.total)) : null,
        lowest: entries.length ? Math.min(...entries.map((s) => s.total)) : null,
        belowPass: pcts.filter((p) => Math.round(p) < pass).length,
        grades,
      };
    });

    const prev = await previousOf(rows);
    const students = rows.map((r) => {
      const p = prev.get(r.studentId);
      const change = p && r.complete && r.percentage !== null && p.percentage !== null ? round1(r.percentage - p.percentage) : null;
      const failed = r.subjects.filter((s) => s.total !== null && Math.round(pctOf(s.total, s.maxMarks)) < pass).map((s) => s.name);
      return {
        id: r.studentId,
        name: r.studentName,
        rollNumber: r.rollNumber,
        complete: r.complete,
        total: r.total,
        maxTotal: r.maxTotal,
        percentage: r.percentage,
        grade: r.grade,
        gpa: r.gpa,
        rank: r.rank,
        change,
        previousExam: p?.examName || null,
        failed,
        subjects: Object.fromEntries(r.subjects.map((s) => [s.name, { total: s.total, maxMarks: s.maxMarks, grade: s.grade }])),
      };
    });

    const complete = students.filter((s) => s.complete && s.percentage !== null);
    const top = [...complete].sort((a, b) => b.percentage - a.percentage).slice(0, 5);
    const improved = complete.filter((s) => s.change !== null && s.change > 0).sort((a, b) => b.change - a.change).slice(0, 5);
    const needsAttention = students
      .map((s) => {
        const reasons = [];
        if (s.complete && s.percentage !== null && Math.round(s.percentage) < pass) reasons.push(`Below the pass mark overall (${s.percentage}%)`);
        if (s.failed.length) reasons.push(`Below the pass mark in ${s.failed.join(', ')}`);
        if (s.change !== null && s.change <= -10) reasons.push(`Dropped ${Math.abs(s.change)}% since ${s.previousExam}`);
        return { ...s, reasons };
      })
      .filter((s) => s.reasons.length)
      .sort((a, b) => b.reasons.length - a.reasons.length || (a.percentage ?? 0) - (b.percentage ?? 0));

    // Class 10: board-exam readiness from the last two results in each subject
    let board = null;
    if (isBoardClass(cls?.name || '')) {
      board = [];
      for (const s of students) {
        const last2 = await prisma.resultSnapshot.findMany({
          where: { studentId: s.id, complete: true }, orderBy: { examDate: 'desc' }, take: 2,
        });
        const source = last2.length ? last2 : [rows.find((r) => r.studentId === s.id)];
        const risk = [];
        for (const name of subjectNames) {
          const ps = source.map((x) => x.subjects.find((y) => y.name === name)).filter((y) => y && y.total !== null).map((y) => pctOf(y.total, y.maxMarks));
          if (!ps.length) continue;
          const a = ps.reduce((m, n) => m + n, 0) / ps.length;
          if (a < pass) risk.push({ subject: name, average: round1(a), level: 'At risk' });
          else if (a < 50) risk.push({ subject: name, average: round1(a), level: 'Borderline' });
        }
        if (risk.length) board.push({ id: s.id, name: s.name, rollNumber: s.rollNumber, risk });
      }
    }

    const pcts = complete.map((s) => s.percentage);
    res.json({
      className: cls?.name,
      examName: rows[0].examName,
      passMark: pass,
      saved: rows[0].id !== undefined, // from snapshots (finalized) vs live marks
      summary: {
        students: students.length,
        complete: complete.length,
        average: pcts.length ? round1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
        highest: pcts.length ? Math.max(...pcts) : null,
        passed: complete.filter((s) => Math.round(s.percentage) >= pass).length,
      },
      subjects,
      top,
      improved,
      needsAttention,
      board,
      students,
    });
  } catch (err) { fail(res, err); }
};

// ── GET /api/analysis/classes/:classId/compare?a=examId&b=examId ── two exams side by side
exports.compare = async (req, res) => {
  const classId = Number(req.params.classId);
  const a = Number(req.query.a);
  const b = Number(req.query.b);
  try {
    if (!(await canSeeClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const [ra, rb] = await Promise.all([classRows(prisma, a, classId), classRows(prisma, b, classId)]);
    if (!ra.length || !rb.length) return res.status(404).json({ error: 'One of these exams has no results for this class.' });
    const avgPct = (rows, name) => {
      const ps = rows.map((r) => r.subjects.find((s) => s.name === name)).filter((s) => s && s.total !== null).map((s) => pctOf(s.total, s.maxMarks));
      return ps.length ? round1(ps.reduce((m, n) => m + n, 0) / ps.length) : null;
    };
    const names = [...new Set([...ra[0].subjects.map((s) => s.name), ...rb[0].subjects.map((s) => s.name)])];
    const classAvg = (rows) => {
      const ps = rows.filter((r) => r.complete && r.percentage !== null).map((r) => r.percentage);
      return ps.length ? round1(ps.reduce((m, n) => m + n, 0) / ps.length) : null;
    };
    const byStudent = new Map(ra.map((r) => [r.studentId, r]));
    const changes = rb
      .filter((r) => r.complete && byStudent.get(r.studentId)?.complete)
      .map((r) => ({ id: r.studentId, name: r.studentName, rollNumber: r.rollNumber, from: byStudent.get(r.studentId).percentage, to: r.percentage, change: round1(r.percentage - byStudent.get(r.studentId).percentage) }))
      .sort((x, y) => y.change - x.change);
    res.json({
      examA: ra[0].examName,
      examB: rb[0].examName,
      classAverage: { a: classAvg(ra), b: classAvg(rb) },
      subjects: names.map((n) => ({ name: n, a: avgPct(ra, n), b: avgPct(rb, n) })),
      improved: changes.filter((c) => c.change > 0).length,
      dropped: changes.filter((c) => c.change < 0).length,
      students: changes,
    });
  } catch (err) { fail(res, err); }
};

// ── Remedial groups ──
async function groupProgress(g) {
  const members = await prisma.student.findMany({ where: { id: { in: g.studentIds } }, select: { id: true, name: true, rollNumber: true } });
  const out = [];
  for (const m of members.sort(byRoll)) {
    const latest = await prisma.resultSnapshot.findFirst({ where: { studentId: m.id, complete: true }, orderBy: { examDate: 'desc' } });
    const sub = latest?.subjects?.find((s) => s.name === g.subject);
    const now = sub ? pctOf(sub.total, sub.maxMarks) : null;
    const base = g.baseline?.[m.id] ?? null;
    out.push({
      id: m.id, name: m.name, rollNumber: m.rollNumber,
      baseline: base === null ? null : round1(base),
      latest: now === null ? null : round1(now),
      latestExam: latest && latest.examId !== g.baseExamId ? latest.examName : null,
      change: base !== null && now !== null && latest?.examId !== g.baseExamId ? round1(now - base) : null,
    });
  }
  return out;
}

// GET /api/analysis/classes/:classId/remedial
exports.listRemedial = async (req, res) => {
  const classId = Number(req.params.classId);
  try {
    if (!(await canSeeClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const groups = await prisma.remedialGroup.findMany({ where: { classId }, orderBy: { createdAt: 'desc' } });
    res.json({ groups: await Promise.all(groups.map(async (g) => ({ ...g, members: await groupProgress(g) }))) });
  } catch (err) { fail(res, err); }
};

// POST /api/analysis/classes/:classId/remedial  { name, subject, studentIds, examId, note? }
exports.createRemedial = async (req, res) => {
  const classId = Number(req.params.classId);
  const { name, subject, note } = req.body || {};
  const studentIds = [...new Set((req.body?.studentIds || []).map(Number).filter(Number.isInteger))];
  const examId = Number(req.body?.examId) || null;
  if (!String(name || '').trim() || !String(subject || '').trim()) return res.status(400).json({ error: 'Give the group a name and a subject.' });
  if (!studentIds.length) return res.status(400).json({ error: 'Choose at least one student.' });
  try {
    if (!(await canSeeClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const rows = examId ? await classRows(prisma, examId, classId) : [];
    const baseline = {};
    for (const id of studentIds) {
      const s = rows.find((r) => r.studentId === id)?.subjects.find((x) => x.name === subject);
      baseline[id] = s ? pctOf(s.total, s.maxMarks) : null;
    }
    const group = await prisma.remedialGroup.create({
      data: { name: String(name).trim().slice(0, 80), classId, subject, studentIds, baseline, baseExamId: examId, note: note ? String(note).slice(0, 300) : null, createdById: req.user.userId },
    });
    res.status(201).json({ group });
  } catch (err) { fail(res, err); }
};

// DELETE /api/analysis/remedial/:id
exports.deleteRemedial = async (req, res) => {
  try {
    const g = await prisma.remedialGroup.findUnique({ where: { id: Number(req.params.id) } });
    if (!g) return res.status(404).json({ error: 'Group not found.' });
    if (!(await canSeeClass(req.user, g.classId))) return res.status(403).json({ error: 'Not your class.' });
    await prisma.remedialGroup.delete({ where: { id: g.id } });
    res.json({ ok: true });
  } catch (err) { fail(res, err); }
};

// ── GET /api/analysis/my-subjects ── a teacher's subjects: weak students in the latest exam of each class
exports.mySubjects = async (req, res) => {
  try {
    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: req.user.userId },
      include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } } },
    });
    const pass = passMark();
    const out = [];
    for (const a of assignments) {
      const exams = await examsForClass(a.classId);
      const exam = exams[0];
      if (!exam) { out.push({ classId: a.classId, className: a.class.name, subject: a.subject.name, exam: null, weak: [] }); continue; }
      const rows = await classRows(prisma, exam.id, a.classId);
      const entries = rows
        .map((r) => ({ r, s: r.subjects.find((x) => x.name === a.subject.name) }))
        .filter((x) => x.s && x.s.total !== null)
        .map(({ r, s }) => ({ id: r.studentId, name: r.studentName, rollNumber: r.rollNumber, total: s.total, maxMarks: s.maxMarks, grade: s.grade, pct: round1(pctOf(s.total, s.maxMarks)) }));
      const avgPct = entries.length ? round1(entries.reduce((m, e) => m + e.pct, 0) / entries.length) : null;
      out.push({
        classId: a.classId,
        className: a.class.name,
        subject: a.subject.name,
        exam: exam.name,
        average: avgPct,
        weak: entries.filter((e) => Math.round(e.pct) < Math.max(pass, 50)).sort((x, y) => x.pct - y.pct),
      });
    }
    out.sort((x, y) => x.className.localeCompare(y.className, undefined, { numeric: true }) || x.subject.localeCompare(y.subject));
    res.json({ passMark: pass, subjects: out });
  } catch (err) { fail(res, err); }
};

// ── GET /api/analysis/my-classes ── classes this user can analyse (admin: all)
exports.myClasses = async (req, res) => {
  try {
    const where = isAdmin(req.user) ? {} : {
      OR: [{ classTeacherId: req.user.userId }, { teacherAssignments: { some: { teacherId: req.user.userId } } }],
    };
    const classes = await prisma.class.findMany({ where, select: { id: true, name: true, classTeacherId: true } });
    classes.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
    res.json({ classes: classes.map((c) => ({ id: c.id, name: c.name, isClassTeacher: c.classTeacherId === req.user.userId })) });
  } catch (err) { fail(res, err); }
};

// ── GET /api/analysis/at-risk ── students with low marks and/or low attendance (admin)
// Marks: latest finalized result below the pass mark, or below it in 2+ subjects, or dropped 10%+.
// Attendance: below 75% this academic year (once at least 10 days have been taken).
exports.atRisk = async (req, res) => {
  const att = require('../lib/attendance');
  try {
    const pass = passMark();
    const settings = await att.getSettings(prisma);
    const today = att.todayIST();
    const students = await prisma.student.findMany({ select: { id: true, name: true, rollNumber: true, classId: true, class: { select: { name: true } } } });
    const snaps = await prisma.resultSnapshot.findMany({ where: { complete: true }, orderBy: { examDate: 'asc' }, select: { studentId: true, examName: true, percentage: true, subjects: true } });
    const records = await prisma.attendanceRecord.findMany({ where: { date: { gte: att.toDate(att.academicYearStart(today)), lte: att.toDate(today) } } });
    const attendance = att.totals(records, settings.mode, settings.periodRule);
    const byStudent = new Map();
    for (const sn of snaps) {
      if (!byStudent.has(sn.studentId)) byStudent.set(sn.studentId, []);
      byStudent.get(sn.studentId).push(sn);
    }

    const rows = [];
    for (const st of students) {
      const list = byStudent.get(st.id) || [];
      const latest = list[list.length - 1];
      const prev = list[list.length - 2];
      const marks = [];
      if (latest) {
        if (Math.round(latest.percentage) < pass) marks.push(`Below the pass mark overall (${latest.percentage}% in ${latest.examName})`);
        const failed = (latest.subjects || []).filter((x) => x.total !== null && Math.round(pctOf(x.total, x.maxMarks)) < pass).map((x) => x.name);
        if (failed.length >= 2) marks.push(`Below the pass mark in ${failed.join(', ')}`);
        if (prev && latest.percentage - prev.percentage <= -10) marks.push(`Dropped ${round1(prev.percentage - latest.percentage)}% since ${prev.examName}`);
      }
      const a = attendance[st.id];
      const attendanceLow = a && a.days >= 10 && a.percent < 75;
      if (!marks.length && !attendanceLow) continue;
      rows.push({
        id: st.id, name: st.name, rollNumber: st.rollNumber, className: st.class.name,
        latest: latest ? { examName: latest.examName, percentage: latest.percentage } : null,
        attendance: a ? { percent: a.percent, days: a.days } : null,
        reasons: [...marks, ...(attendanceLow ? [`Attendance ${a.percent}% this year`] : [])],
        level: marks.length && attendanceLow ? 'high' : 'watch',
      });
    }
    rows.sort((x, y) => (x.level === y.level ? 0 : x.level === 'high' ? -1 : 1) || y.reasons.length - x.reasons.length
      || x.className.localeCompare(y.className, undefined, { numeric: true }));
    res.json({ passMark: pass, high: rows.filter((r) => r.level === 'high').length, students: rows });
  } catch (err) { fail(res, err); }
};

// ── GET /api/analysis/subjects-overview ── weak subjects in every class (admin) or the teacher's own classes
// For each class: its latest exam (finalized if there is one), and per subject the average and
// the students below the pass mark and below 50%. Worst subjects first.
exports.subjectsOverview = async (req, res) => {
  try {
    const pass = passMark();
    const where = isAdmin(req.user) ? {} : { classTeacherId: req.user.userId };
    const classes = await prisma.class.findMany({ where, select: { id: true, name: true } });
    const rows = [];
    for (const c of classes) {
      const exams = await examsForClass(c.id);
      const exam = exams.find((e) => e.finalized) || exams[0];
      if (!exam) continue;
      const results = await classRows(prisma, exam.id, c.id);
      if (!results.length) continue;
      for (const name of results[0].subjects.map((s) => s.name)) {
        const entries = results
          .map((r) => ({ r, s: r.subjects.find((x) => x.name === name) }))
          .filter((x) => x.s && x.s.total !== null)
          .map(({ r, s }) => ({ id: r.studentId, name: r.studentName, rollNumber: r.rollNumber, total: s.total, maxMarks: s.maxMarks, pct: round1(pctOf(s.total, s.maxMarks)) }))
          .sort((x, y) => x.pct - y.pct);
        if (!entries.length) continue;
        const average = round1(entries.reduce((m, e) => m + e.pct, 0) / entries.length);
        const belowPass = entries.filter((e) => Math.round(e.pct) < pass);
        const below50 = entries.filter((e) => Math.round(e.pct) >= pass && Math.round(e.pct) < 50);
        rows.push({
          classId: c.id, className: c.name, examId: exam.id, examName: exam.name, finalized: exam.finalized,
          subject: name, students: entries.length, average,
          belowPass, below50,
        });
      }
    }
    // Worst first: most students below the pass mark, then lowest average
    rows.sort((x, y) => y.belowPass.length - x.belowPass.length || x.average - y.average);
    res.json({
      passMark: pass,
      totals: {
        subjectsWithFails: rows.filter((r) => r.belowPass.length).length,
        studentsBelowPass: new Set(rows.flatMap((r) => r.belowPass.map((s) => s.id))).size,
      },
      subjects: rows,
    });
  } catch (err) { fail(res, err); }
};

exports.examsForClass = examsForClass;
exports.canSeeClass = canSeeClass;
