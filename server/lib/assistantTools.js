/**
 * assistantTools.js — the read-only tools the admin's AI assistant can use.
 *
 * Every tool only READS data. They return names, classes, roll numbers, marks,
 * grades and ranks — never phone numbers, Aadhaar/APAAR numbers or addresses,
 * so those never leave the school's server.
 */

const { buildClassReport } = require('./reportData');
const { passMark, currentScale } = require('./grades');
const { byRoll } = require('./rollOrder');
const { ranks } = require('./snapshots');

const byClassName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
const round1 = (n) => Math.round(n * 10) / 10;

// JSON schemas are strict: every property listed in `required`, no extra properties.
const nullableInt = (description) => ({ type: ['integer', 'null'], description });

const TOOLS = [
  {
    name: 'school_overview',
    description: 'Counts of students, classes and teachers, and the list of classes with their id, number of students and class teacher. Use it to find a class id from a class name.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'list_exams',
    description: 'Exams that are open or finalized, newest first, with id, status, whether results are published, and the classes in each exam. Optionally only the exams of one class.',
    input_schema: {
      type: 'object',
      properties: { class_id: nullableInt('Only exams of this class; null for all exams.') },
      required: ['class_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'find_students',
    description: 'Find students by (part of) their name, optionally within one class. Returns up to 25 matches with id, name, roll number and class.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full or partial student name. Case does not matter.' },
        class_id: nullableInt('Only search this class; null for the whole school.'),
      },
      required: ['name', 'class_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'class_exam_results',
    description: "One class's results in one exam: each subject's maximum marks, class average, highest and lowest, and how many are below the pass mark; and every student's subject marks, total, percentage, grade, GPA and rank.",
    input_schema: {
      type: 'object',
      properties: {
        exam_id: { type: 'integer', description: 'Exam id from list_exams.' },
        class_id: { type: 'integer', description: 'Class id from school_overview.' },
      },
      required: ['exam_id', 'class_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'student_history',
    description: "One student's results in every exam of their class (oldest first): subject marks and grades, total, percentage, grade, GPA and rank in class. Use it for a student's progress or strengths and weaknesses.",
    input_schema: {
      type: 'object',
      properties: { student_id: { type: 'integer', description: 'Student id from find_students.' } },
      required: ['student_id'],
      additionalProperties: false,
    },
  },
].map((t) => ({ ...t, strict: true }));

/** Exams (open or finalized) that include a class. */
function examsOfClass(prisma, classId, order = 'desc') {
  return prisma.exam.findMany({
    where: {
      status: { in: ['Open', 'Closed'] },
      OR: [{ classId }, { enrollments: { some: { classId } } }],
    },
    orderBy: { createdAt: order },
  });
}

const marksOf = (report, r) =>
  Object.fromEntries(report.subjects.map((sub, i) => [sub.name, r.subjects[i].total === null
    ? 'not entered'
    : `${r.subjects[i].total}/${sub.maxMarks} (${r.subjects[i].grade})`]));

const handlers = {
  async school_overview(prisma) {
    const [students, teachers, classes] = await Promise.all([
      prisma.student.count(),
      prisma.user.count({ where: { roles: { hasSome: ['ClassTeacher', 'SubjectTeacher'] } } }),
      prisma.class.findMany({ include: { classTeacher: { select: { name: true } }, _count: { select: { students: true } } } }),
    ]);
    return {
      students,
      teachers,
      pass_mark_percent: passMark(),
      grading_scale: currentScale().map((b) => ({ grade: b.grade, from_percent: b.min, points: b.points })),
      classes: classes.sort(byClassName).map((c) => ({
        id: c.id, name: c.name, students: c._count.students, class_teacher: c.classTeacher?.name || null,
      })),
    };
  },

  async list_exams(prisma, { class_id }) {
    const where = { status: { in: ['Open', 'Closed'] } };
    if (class_id) where.OR = [{ classId: class_id }, { enrollments: { some: { classId: class_id } } }];
    const exams = await prisma.exam.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { class: { select: { name: true } }, enrollments: { include: { class: { select: { name: true } } } } },
    });
    return exams.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status === 'Closed' ? 'finalized' : 'marks being entered',
      results_published: e.isPublished,
      created: e.createdAt.toISOString().slice(0, 10),
      classes: (e.class ? [e.class.name] : e.enrollments.map((x) => x.class.name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    }));
  },

  async find_students(prisma, { name, class_id }) {
    const students = await prisma.student.findMany({
      where: { name: { contains: name.trim(), mode: 'insensitive' }, ...(class_id ? { classId: class_id } : {}) },
      select: { id: true, name: true, rollNumber: true, class: { select: { id: true, name: true } } },
      take: 25,
    });
    return students.sort(byRoll).map((s) => ({ id: s.id, name: s.name, roll: s.rollNumber, class: s.class.name, class_id: s.class.id }));
  },

  async class_exam_results(prisma, { exam_id, class_id }) {
    const report = await buildClassReport(prisma, exam_id, class_id);
    if (!report) return { error: 'That class is not part of that exam (check the exam id and class id).' };
    const pass = passMark();
    const { rankOf, ranked } = ranks(report.results);
    const subjects = report.subjects.map((sub, i) => {
      const totals = report.results.map((r) => r.subjects[i].total).filter((t) => t !== null);
      const pcts = totals.map((t) => (t / sub.maxMarks) * 100);
      return {
        subject: sub.name,
        max_marks: sub.maxMarks,
        entered: totals.length,
        average: totals.length ? round1(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
        highest: totals.length ? Math.max(...totals) : null,
        lowest: totals.length ? Math.min(...totals) : null,
        below_pass_mark: pcts.filter((p) => Math.round(p) < pass).length,
      };
    });
    return {
      exam: report.exam.name,
      class: report.class.name,
      class_teacher: report.class.classTeacher,
      pass_mark_percent: pass,
      students_with_complete_marks: ranked,
      subjects,
      students: report.results.map((r) => ({
        id: r.student.id,
        name: r.student.name,
        roll: r.student.rollNumber,
        marks_complete: r.complete,
        total: `${r.total}/${r.maxTotal}`,
        percentage: r.percentage,
        grade: r.grade,
        gpa: r.gpa,
        rank: rankOf.get(r.student.id) ?? null,
        subjects: marksOf(report, r),
      })),
    };
  },

  async student_history(prisma, { student_id }) {
    const student = await prisma.student.findUnique({
      where: { id: student_id },
      select: { id: true, name: true, rollNumber: true, classId: true, class: { select: { name: true } } },
    });
    if (!student) return { error: 'No student with that id.' };
    const exams = await examsOfClass(prisma, student.classId, 'asc');
    const history = [];
    for (const exam of exams) {
      const report = await buildClassReport(prisma, exam.id, student.classId);
      const r = report?.results.find((x) => x.student.id === student.id);
      if (!r) continue;
      const { rankOf, ranked } = ranks(report.results);
      history.push({
        exam: report.exam.name,
        status: exam.status === 'Closed' ? 'finalized' : 'marks being entered',
        marks_complete: r.complete,
        total: `${r.total}/${r.maxTotal}`,
        percentage: r.percentage,
        grade: r.grade,
        gpa: r.gpa,
        rank: rankOf.has(student.id) ? `${rankOf.get(student.id)} of ${ranked}` : null,
        subjects: marksOf(report, r),
      });
    }
    return { name: student.name, class: student.class.name, roll: student.rollNumber, pass_mark_percent: passMark(), exams: history };
  },
};

/** Run one tool. Returns a JSON string (errors too, so the model can recover). */
async function runTool(prisma, name, input) {
  const handler = handlers[name];
  if (!handler) return { content: JSON.stringify({ error: `Unknown tool ${name}` }), isError: true };
  try {
    return { content: JSON.stringify(await handler(prisma, input || {})), isError: false };
  } catch (err) {
    console.error(`[assistant] tool ${name} failed`, err);
    return { content: JSON.stringify({ error: 'That lookup failed. Try a different question.' }), isError: true };
  }
}

module.exports = { TOOLS, runTool };
