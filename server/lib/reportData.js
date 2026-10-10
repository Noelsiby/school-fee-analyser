/**
 * reportData.js — everything a progress report / WhatsApp result needs for one
 * exam and one class: subjects (with their parts and max marks), and for each
 * student their marks, subject totals, grade + points per subject, overall
 * total, percentage, GPA and average grade, plus the highest GPA in the class.
 */

const { MAIN, PARTS, partKeys } = require('./components');
const { gradeFor, pointsFor } = require('./grades');
const { byRoll } = require('./rollOrder');

// Usual report-card order; anything not matched goes after these, alphabetically.
const SUBJECT_ORDER = [
  /telugu|^tel\b/i, /hindi|^hin\b/i, /english|^eng\b/i, /math/i, /^e\s*\.?\s*v\s*\.?\s*s\.?$|evs/i,
  /science|^n\s*\.?\s*s\.?$/i, /physics|^p\s*\.?\s*s\.?$/i, /social|^s\s*\.?\s*s\.?$/i,
  /computer|^com\b/i, /iit/i,
];
const orderOf = (name) => {
  const i = SUBJECT_ORDER.findIndex((re) => re.test(name.trim()));
  return i === -1 ? SUBJECT_ORDER.length : i;
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Fields of a student that make up the profile ("Bio Data"). */
const PROFILE_FIELDS = [
  'fatherName', 'section', 'admissionNo', 'admissionDate', 'dateOfBirth', 'bloodGroup',
  'idMark1', 'idMark2', 'address', 'aadhaarNo', 'apaarNo', 'phoneRes', 'parentPhone',
];

/**
 * Build report data for one exam and one class.
 * @param prisma
 * @param {number} examId
 * @param {number} classId
 * @param {object} [opts] { studentId?: number, withPhotos?: boolean }
 * @returns null if the exam doesn't include this class
 */
async function buildClassReport(prisma, examId, classId, opts = {}) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { enrollments: { where: { classId } } },
  });
  if (!exam) return null;
  const inExam = exam.examType === 'INTERNAL_EXAM' ? exam.enrollments.length > 0 : exam.classId === classId;
  if (!inExam) return null;

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      classTeacher: { select: { id: true, name: true } },
      students: { include: { photo: { select: { studentId: true } } } },
    },
  });
  if (!cls) return null;

  const configs = await prisma.examSubjectConfig.findMany({
    where: { examId, subject: { classId } },
    include: { subject: true },
  });
  const subjects = configs
    .map((c) => ({
      id: c.subjectId,
      name: c.subject.name,
      maxMarks: c.maxMarks,
      componentMaxMarks: c.componentMaxMarks || null,
      parts: partKeys(c.componentMaxMarks).filter((k) => k !== MAIN),
    }))
    .sort((a, b) => orderOf(a.name) - orderOf(b.name) || a.name.localeCompare(b.name));

  const marks = await prisma.mark.findMany({ where: { examId, student: { classId } } });
  const markOf = new Map(marks.map((m) => [`${m.studentId}:${m.subjectId}`, m]));

  const results = [...cls.students].sort(byRoll).map((student) => {
    const rows = subjects.map((sub) => {
      const m = markOf.get(`${student.id}:${sub.id}`);
      const obtained = m && m.marksObtained !== null ? m.marksObtained : null;
      const percentage = obtained !== null && sub.maxMarks > 0 ? (obtained / sub.maxMarks) * 100 : null;
      // Main mark: the main part for subjects with parts, else the single mark.
      const main = sub.componentMaxMarks
        ? (m?.componentMarks?.[MAIN] ?? (m?.componentMarks ? null : obtained))
        : obtained;
      const parts = Object.fromEntries(PARTS.map((p) => [p, m?.componentMarks?.[p] ?? null]));
      return {
        subjectId: sub.id,
        main,
        parts,
        total: obtained,
        maxMarks: sub.maxMarks,
        grade: percentage === null ? null : gradeFor(percentage),
        points: percentage === null ? null : pointsFor(percentage),
      };
    });

    const entered = rows.filter((r) => r.total !== null);
    const total = entered.reduce((s, r) => s + r.total, 0);
    const maxTotal = entered.reduce((s, r) => s + r.maxMarks, 0);
    const percentage = maxTotal > 0 ? round2((total / maxTotal) * 100) : null;
    const gpa = entered.length ? round2(entered.reduce((s, r) => s + r.points, 0) / entered.length) : null;

    const profile = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, student[f] ?? null]));
    return {
      student: {
        id: student.id,
        name: student.name,
        rollNumber: student.rollNumber,
        hasPhoto: !!student.photo,
        ...profile,
      },
      subjects: rows,
      total,
      maxTotal,
      percentage,
      gpa,
      grade: percentage === null ? null : gradeFor(percentage),
      complete: subjects.length > 0 && entered.length === subjects.length,
    };
  });

  const gpas = results.map((r) => r.gpa).filter((g) => g !== null);
  const highestGpa = gpas.length ? Math.max(...gpas) : null;

  let selected = opts.studentId ? results.filter((r) => r.student.id === opts.studentId) : results;

  if (opts.withPhotos) {
    const ids = selected.filter((r) => r.student.hasPhoto).map((r) => r.student.id);
    const photos = ids.length ? await prisma.studentPhoto.findMany({ where: { studentId: { in: ids } } }) : [];
    const byId = new Map(photos.map((p) => [p.studentId, `data:${p.mimeType};base64,${Buffer.from(p.data).toString('base64')}`]));
    selected = selected.map((r) => ({ ...r, student: { ...r.student, photo: byId.get(r.student.id) || null } }));
  }

  return {
    exam: { id: exam.id, name: exam.name, status: exam.status, isPublished: exam.isPublished },
    class: { id: cls.id, name: cls.name, classTeacher: cls.classTeacher?.name || null },
    subjects,
    highestGpa,
    results: selected,
  };
}

/** One-line subject marks for a WhatsApp message: "English 54/65, Telugu 47/50". */
function marksLine(report, result) {
  return report.subjects
    .map((sub, i) => {
      const r = result.subjects[i];
      return `${sub.name} ${r.total === null ? 'AB' : r.total}/${sub.maxMarks}`;
    })
    .join(', ');
}

module.exports = { buildClassReport, marksLine, PROFILE_FIELDS };
