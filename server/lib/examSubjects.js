/**
 * examSubjects.js — keep running exams in step with the classes' subjects.
 *
 * Why: an exam's subjects (ExamSubjectConfig) are set when the admin configures max marks.
 * A subject added to a class later (new subject, copied subjects, a class added to an
 * internal exam) was missing from the exam, so its teacher could not enter marks.
 *
 * addMissingExamSubjects() adds those subjects to every exam that is still running
 * (Draft or Open, not locked, already configured) with the max marks the exam's other
 * subjects use most (e.g. 50), or 100. Closed / finalized exams are never changed.
 */

const OPEN_STATUSES = ['Draft', 'Open'];

/** Most common max marks (Main mark for split subjects) among an exam's configs. */
function usualMaxMarks(configs) {
  const counts = new Map();
  for (const c of configs) {
    const v = Number(c.componentMaxMarks?.Main ?? c.maxMarks);
    if (v > 0) counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = 100, n = 0;
  for (const [v, k] of counts) if (k > n || (k === n && v > best)) { best = v; n = k; }
  return best;
}

/**
 * @param prisma
 * @param {{ classIds?: number[], examIds?: number[] }} [scope]  limit to these classes / exams (default: all)
 * @returns {Promise<Array<{ examId, examName, subjectId, subjectName, className, maxMarks }>>}
 */
async function addMissingExamSubjects(prisma, scope = {}) {
  const classIds = scope.classIds?.map(Number).filter(Boolean);
  const where = { status: { in: OPEN_STATUSES }, isLocked: false, subjectConfigs: { some: {} } };
  if (scope.examIds?.length) where.id = { in: scope.examIds.map(Number) };
  if (classIds?.length) where.OR = [{ classId: { in: classIds } }, { enrollments: { some: { classId: { in: classIds } } } }];

  const exams = await prisma.exam.findMany({
    where,
    select: {
      id: true, name: true, examType: true, classId: true,
      enrollments: { select: { classId: true, isLocked: true } },
      subjectConfigs: { select: { subjectId: true, maxMarks: true, componentMaxMarks: true } },
    },
  });
  if (!exams.length) return [];

  const added = [];
  for (const exam of exams) {
    // Classes of this exam whose marks are not finalized yet
    let targets = exam.examType === 'INTERNAL_EXAM'
      ? exam.enrollments.filter((e) => !e.isLocked).map((e) => e.classId)
      : (exam.classId ? [exam.classId] : []);
    if (classIds?.length) targets = targets.filter((id) => classIds.includes(id));
    if (!targets.length) continue;

    const subjects = await prisma.subject.findMany({
      where: { classId: { in: targets } },
      select: { id: true, name: true, class: { select: { name: true } } },
    });
    const have = new Set(exam.subjectConfigs.map((c) => c.subjectId));
    const missing = subjects.filter((s) => !have.has(s.id));
    if (!missing.length) continue;

    const maxMarks = usualMaxMarks(exam.subjectConfigs);
    await prisma.examSubjectConfig.createMany({
      data: missing.map((s) => ({ examId: exam.id, subjectId: s.id, maxMarks })),
      skipDuplicates: true,
    });
    for (const s of missing) {
      added.push({ examId: exam.id, examName: exam.name, subjectId: s.id, subjectName: s.name, className: s.class.name, maxMarks });
    }
  }
  if (added.length) {
    console.log(`[exam-subjects] added ${added.length} subject(s) to running exams:`,
      added.map((a) => `${a.examName} / ${a.className} ${a.subjectName} (${a.maxMarks})`).join('; '));
  }
  return added;
}

module.exports = { addMissingExamSubjects, usualMaxMarks };
