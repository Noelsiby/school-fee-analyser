/**
 * GET /api/search?q=divya&role=Admin — the search box at the top of every page (Ctrl+K).
 * Only finds what the person may open in the role they are using:
 *   Admin           students, classes, teachers, exams (everything)
 *   ClassTeacher    students, classes and exams of their own classes
 *   SubjectTeacher  the exams/subjects they enter marks for
 */
const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { byClassName } = require('../lib/classOrder');

const prisma = new PrismaClient();
const LIMIT = 8;

router.get('/', authenticate, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const roles = req.user.roles || [];
  const role = roles.includes(req.query.role) ? req.query.role : roles[0];
  if (q.length < 2) return res.json({ students: [], classes: [], teachers: [], exams: [] });
  const has = { contains: q, mode: 'insensitive' };
  const me = req.user.userId;

  try {
    if (role === 'Admin') {
      const [students, classes, teachers, exams] = await Promise.all([
        prisma.student.findMany({
          where: { OR: [{ name: has }, { rollNumber: q }, { admissionNo: q }] },
          select: { id: true, name: true, rollNumber: true, class: { select: { id: true, name: true } } }, take: LIMIT,
        }),
        prisma.class.findMany({ where: { name: has }, select: { id: true, name: true, _count: { select: { students: true } } }, take: LIMIT }),
        prisma.user.findMany({
          where: { name: has, roles: { hasSome: ['ClassTeacher', 'SubjectTeacher'] } },
          select: { id: true, name: true, email: true }, take: LIMIT,
        }),
        prisma.exam.findMany({ where: { name: has }, select: { id: true, name: true, status: true }, orderBy: { createdAt: 'desc' }, take: LIMIT }),
      ]);
      return res.json({ students, classes: classes.sort(byClassName), teachers, exams });
    }

    if (role === 'ClassTeacher') {
      const mine = await prisma.class.findMany({ where: { classTeacherId: me }, select: { id: true, name: true, _count: { select: { students: true } } } });
      const ids = mine.map((c) => c.id);
      const [students, exams] = await Promise.all([
        prisma.student.findMany({
          where: { classId: { in: ids }, OR: [{ name: has }, { rollNumber: q }] },
          select: { id: true, name: true, rollNumber: true, class: { select: { id: true, name: true } } }, take: LIMIT,
        }),
        prisma.exam.findMany({
          where: { name: has, status: { in: ['Open', 'Closed'] }, OR: [{ classId: { in: ids } }, { enrollments: { some: { classId: { in: ids } } } }] },
          select: { id: true, name: true, status: true, classId: true, enrollments: { where: { classId: { in: ids } }, select: { classId: true } } },
          orderBy: { createdAt: 'desc' }, take: LIMIT,
        }),
      ]);
      return res.json({
        students,
        classes: mine.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).sort(byClassName),
        teachers: [],
        exams: exams.map((e) => ({ id: e.id, name: e.name, status: e.status, classId: e.classId || e.enrollments[0]?.classId })),
      });
    }

    // Subject teacher: their exam subjects, matched by exam, subject or class name
    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId: me }, select: { subjectId: true, classId: true, subject: { select: { name: true } }, class: { select: { name: true } } },
    });
    const configs = await prisma.examSubjectConfig.findMany({
      where: { subjectId: { in: assignments.map((a) => a.subjectId) }, exam: { status: { in: ['Open', 'Closed'] } } },
      select: { subjectId: true, exam: { select: { id: true, name: true, status: true } } },
    });
    const ql = q.toLowerCase();
    const marks = configs
      .map((c) => {
        const a = assignments.find((x) => x.subjectId === c.subjectId);
        return { examId: c.exam.id, examName: c.exam.name, status: c.exam.status, subjectId: c.subjectId, subjectName: a.subject.name, className: a.class.name };
      })
      .filter((m) => [m.examName, m.subjectName, m.className].some((v) => v.toLowerCase().includes(ql)))
      .slice(0, LIMIT);
    return res.json({ students: [], classes: [], teachers: [], exams: [], marks });
  } catch (err) {
    console.error('[search]', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

module.exports = router;
