/**
 * GET /api/todo?role=Admin — "What to do next" on each dashboard: a short list of the jobs
 * waiting for this person, each with a link. Built from the data, so it's always up to date.
 *   Admin           exams to publish / send to teachers, subjects without a teacher, missing parent numbers / photos
 *   ClassTeacher    marks to approve, exams to finalize, report-card attendance, missing parent numbers
 *   SubjectTeacher  marks still to enter, marks to submit, marks sent back
 * No time-of-day reminders (the school decides its own timings).
 * Item: { level: 'action' | 'info' | 'done', icon, text, detail?, to, button }
 */
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { byClassName } = require('../lib/classOrder');

const prisma = new PrismaClient();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Classes of an exam, with whether each is finalized. */
const examClasses = (e) => (e.examType === 'INTERNAL_EXAM'
  ? e.enrollments.map((x) => ({ id: x.classId, name: x.class.name, done: x.isLocked }))
  : e.class ? [{ id: e.class.id, name: e.class.name, done: e.isLocked || e.status === 'Closed' }] : []);

async function adminTodo() {
  const items = [];
  const exams = await prisma.exam.findMany({
    where: { OR: [{ status: { in: ['Draft', 'Open'] } }, { status: 'Closed', isPublished: false }] },
    include: { class: { select: { id: true, name: true } }, enrollments: { include: { class: { select: { name: true } } } }, _count: { select: { subjectConfigs: true } } },
    orderBy: { createdAt: 'desc' },
  });
  for (const e of exams) {
    const cls = examClasses(e);
    const done = cls.filter((c) => c.done).length;
    if (e.status === 'Draft') {
      items.push(e._count.subjectConfigs
        ? { level: 'action', icon: '🚀', text: `Send "${e.name}" to teachers`, detail: 'Max marks are set. Teachers can start entering marks once you send it.', to: '/admin/exams', button: 'Open Exams' }
        : { level: 'action', icon: '⚙️', text: `Set max marks for "${e.name}"`, detail: 'Then send it to the teachers.', to: '/admin/exams', button: 'Open Exams' });
    } else if (!e.isPublished && cls.length && done === cls.length) {
      items.push({ level: 'action', icon: '🌐', text: `Publish "${e.name}" results`, detail: `${cls.length === 1 ? `${cls[0].name} is finalized` : `All ${cls.length} classes are finalized`}. Publishing sends the results to parents.`, to: '/admin/exams', button: 'Publish' });
    } else if (e.status === 'Open') {
      items.push({ level: 'info', icon: '✍️', text: `"${e.name}": ${done} of ${plural(cls.length, 'class', 'classes')} finalized`, detail: cls.filter((c) => !c.done).map((c) => c.name).sort((a, b) => byClassName(a, b)).slice(0, 6).join(', ') + (cls.length - done > 6 ? '…' : ''), to: `/admin/exams/${e.id}/results`, button: 'Results' });
    }
  }

  const noTeacher = await prisma.subject.findMany({ where: { teacherAssignments: { none: {} } }, select: { name: true, class: { select: { name: true } } } });
  if (noTeacher.length) {
    items.push({ level: 'action', icon: '👩‍🏫', text: `${plural(noTeacher.length, 'subject has', 'subjects have')} no teacher`, detail: `Nobody can enter their marks: ${noTeacher.slice(0, 5).map((s) => `${s.class.name} ${s.name}`).join(', ')}${noTeacher.length > 5 ? '…' : ''}`, to: '/admin/teachers', button: 'Assign' });
  }
  const [noPhone, total, noPhoto] = await Promise.all([
    prisma.student.count({ where: { OR: [{ parentPhone: null }, { parentPhone: '' }] } }),
    prisma.student.count(),
    prisma.student.count({ where: { photo: null } }),
  ]);
  if (noPhone) items.push({ level: 'info', icon: '📱', text: `${plural(noPhone, 'student has', 'students have')} no parent mobile number`, detail: "Their parents can't get WhatsApp messages or use the Student App.", to: '/admin/student-app', button: 'See who' });
  if (noPhoto && noPhoto < total) items.push({ level: 'info', icon: '📷', text: `${plural(noPhoto, 'student has', 'students have')} no photo`, detail: 'Photos appear on report cards and in the Student App.', to: '/admin/photo-day', button: 'Photo day' });
  return items;
}

async function classTeacherTodo(me) {
  const items = [];
  const classes = await prisma.class.findMany({ where: { classTeacherId: me }, select: { id: true, name: true, _count: { select: { students: true } } } });
  const ids = classes.map((c) => c.id);
  if (!ids.length) return items;
  const exams = await prisma.exam.findMany({
    where: { status: { in: ['Open', 'Closed'] }, OR: [{ classId: { in: ids } }, { enrollments: { some: { classId: { in: ids } } } }] },
    include: { enrollments: true, subjectConfigs: { include: { subject: { select: { id: true, name: true, classId: true } } } }, attendanceDays: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const e of exams) {
    for (const c of classes) {
      const inExam = e.classId === c.id || e.enrollments.some((x) => x.classId === c.id);
      if (!inExam) continue;
      const locked = e.examType === 'INTERNAL_EXAM' ? e.enrollments.find((x) => x.classId === c.id)?.isLocked : (e.isLocked || e.status === 'Closed');
      const review = `/class-teacher/exams/${e.id}/review?classId=${c.id}`;
      if (!locked && e.status === 'Open') {
        const subs = e.subjectConfigs.filter((x) => x.subject.classId === c.id).map((x) => x.subject);
        const marks = await prisma.mark.groupBy({ by: ['subjectId', 'status'], where: { examId: e.id, subjectId: { in: subs.map((s) => s.id) } }, _count: true });
        const count = (sid, st) => marks.filter((m) => m.subjectId === sid && (!st || m.status === st)).reduce((n, m) => n + m._count, 0);
        const toApprove = subs.filter((s) => count(s.id, 'SubmittedToClassTeacher') > 0 && count(s.id, 'Pending') === 0 && count(s.id, 'Rejected') === 0);
        const allApproved = subs.length > 0 && subs.every((s) => count(s.id, 'Approved') === c._count.students && c._count.students > 0);
        if (allApproved) items.push({ level: 'action', icon: '✅', text: `Finalize "${e.name}" for ${c.name}`, detail: 'Every subject is approved.', to: review, button: 'Finalize' });
        else if (toApprove.length) items.push({ level: 'action', icon: '📋', text: `Check and approve ${toApprove.map((s) => s.name).join(', ')}`, detail: `${e.name} · ${c.name}: submitted by the subject teacher${toApprove.length === 1 ? '' : 's'}.`, to: review, button: 'Review' });
      }
      if ((locked || e.status === 'Closed') && !e.attendanceDays.some((d) => d.classId === c.id)) {
        items.push({ level: 'info', icon: '📅', text: `Enter report card attendance for "${e.name}"`, detail: `${c.name}: working days and days present, printed on the report cards.`, to: '/class-teacher/dashboard#exams', button: 'Enter' });
      }
    }
  }
  const noPhone = await prisma.student.count({ where: { classId: { in: ids }, OR: [{ parentPhone: null }, { parentPhone: '' }] } });
  if (noPhone) items.push({ level: 'info', icon: '📱', text: `${plural(noPhone, 'student has', 'students have')} no parent mobile number`, detail: 'Add it on the student\'s profile (✏️ Edit profile).', to: '/class-teacher/dashboard#my-students', button: 'My students' });
  return items;
}

async function subjectTeacherTodo(me) {
  const items = [];
  const assignments = await prisma.teacherSubjectAssignment.findMany({
    where: { teacherId: me }, select: { subjectId: true, classId: true, subject: { select: { name: true } }, class: { select: { name: true, _count: { select: { students: true } } } } },
  });
  if (!assignments.length) return items;
  const configs = await prisma.examSubjectConfig.findMany({
    where: { subjectId: { in: assignments.map((a) => a.subjectId) }, exam: { status: 'Open', isLocked: false } },
    select: { subjectId: true, exam: { select: { id: true, name: true, examType: true, enrollments: { select: { classId: true, isLocked: true } } } } },
  });
  for (const cfg of configs) {
    const a = assignments.find((x) => x.subjectId === cfg.subjectId);
    if (cfg.exam.examType === 'INTERNAL_EXAM' && cfg.exam.enrollments.find((x) => x.classId === a.classId)?.isLocked) continue;
    const marks = await prisma.mark.findMany({ where: { examId: cfg.exam.id, subjectId: cfg.subjectId }, select: { marksObtained: true, isAbsent: true, status: true } });
    const total = a.class._count.students;
    const entered = marks.filter((m) => m.marksObtained !== null || m.isAbsent).length;
    const left = Math.max(0, total - entered);
    const to = `/subject-teacher/exams/${cfg.exam.id}/subjects/${cfg.subjectId}/marks`;
    const what = `${a.subject.name} · ${a.class.name}`;
    if (marks.some((m) => m.status === 'Rejected')) items.push({ level: 'action', icon: '↩️', text: `Fix marks sent back: ${what}`, detail: `${cfg.exam.name}: the class teacher asked for changes.`, to, button: 'Fix' });
    else if (left > 0) items.push({ level: 'action', icon: '✍️', text: `Enter marks: ${what}`, detail: `${cfg.exam.name}: ${left === total ? `all ${total} students` : `${plural(left, 'student')} left`}.`, to, button: 'Enter marks' });
    else if (marks.some((m) => m.status === 'Pending')) items.push({ level: 'action', icon: '📤', text: `Submit ${what} to the class teacher`, detail: `${cfg.exam.name}: all marks are in.`, to, button: 'Submit' });
  }
  return items;
}

router.get('/', authenticate, async (req, res) => {
  const roles = req.user.roles || [];
  const role = roles.includes(req.query.role) ? req.query.role : roles[0];
  try {
    const items = role === 'Admin' ? await adminTodo()
      : role === 'ClassTeacher' ? await classTeacherTodo(req.user.userId)
      : await subjectTeacherTodo(req.user.userId);
    // Jobs first, then information
    items.sort((a, b) => (a.level === 'action' ? 0 : 1) - (b.level === 'action' ? 0 : 1));
    res.json({ items });
  } catch (err) {
    console.error('[todo]', err);
    res.status(500).json({ error: 'Could not load the to-do list.' });
  }
});

module.exports = router;
