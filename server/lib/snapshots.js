/**
 * snapshots.js — permanent copies of each student's exam result (the Performance
 * Analyser's data). Taken when a class's marks are finalized, again if they are
 * finalized after an unlock, and just before an exam is deleted, so the analysis
 * survives the exam being deleted.
 */

const { buildClassReport } = require('./reportData');

const round2 = (n) => Math.round(n * 100) / 100;

/** Rank by percentage among students with complete marks (ties share a rank). */
function ranks(results) {
  const scored = results.filter((r) => r.complete && r.percentage !== null).sort((a, b) => b.percentage - a.percentage);
  const rankOf = new Map();
  scored.forEach((r, i) => {
    const prev = scored[i - 1];
    rankOf.set(r.student.id, prev && prev.percentage === r.percentage ? rankOf.get(prev.student.id) : i + 1);
  });
  return { rankOf, ranked: scored.length };
}

/**
 * Snapshot-shaped rows for one class in one exam, from the live marks:
 * [{ studentId, studentName, rollNumber, ...snapshot fields }]. Students with no marks are left out.
 */
async function buildRows(prisma, examId, classId) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  const report = exam && (await buildClassReport(prisma, examId, classId));
  if (!report || !report.results.length) return [];

  const { rankOf, ranked } = ranks(report.results);
  const subjectStats = report.subjects.map((sub, i) => {
    const totals = report.results.map((r) => r.subjects[i].total).filter((t) => t !== null);
    return {
      classAverage: totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
      classHighest: totals.length ? Math.max(...totals) : null,
    };
  });
  const pcts = report.results.filter((r) => r.complete && r.percentage !== null).map((r) => r.percentage);
  const classAverage = pcts.length ? round2(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const classHighest = pcts.length ? Math.max(...pcts) : null;

  return report.results
    .filter((r) => r.subjects.some((x) => x.total !== null))
    .map((r) => ({
      studentId: r.student.id,
      studentName: r.student.name,
      rollNumber: r.student.rollNumber,
      examId,
      examName: report.exam.name,
      examDate: exam.createdAt,
      classId,
      className: report.class.name,
      subjects: report.subjects.map((sub, i) => {
        const row = r.subjects[i];
        return {
          name: sub.name,
          maxMarks: sub.maxMarks,
          total: row.total,
          grade: row.grade,
          points: row.points,
          parts: sub.componentMaxMarks ? { Main: row.main, ...row.parts } : null,
          partMax: sub.componentMaxMarks || null,
          ...subjectStats[i],
        };
      }),
      total: r.total,
      maxTotal: r.maxTotal,
      percentage: r.percentage,
      grade: r.grade,
      gpa: r.gpa,
      rank: rankOf.get(r.student.id) ?? null,
      rankedCount: ranked,
      classAverage,
      classHighest,
      complete: r.complete,
    }));
}

/** Save (or refresh) the snapshot of every student of one class in one exam. Returns how many. */
async function snapshotClass(prisma, examId, classId) {
  const rows = await buildRows(prisma, examId, classId);
  for (const { studentId, studentName, rollNumber, examId: _e, ...data } of rows) {
    await prisma.resultSnapshot.upsert({
      where: { studentId_examId: { studentId, examId } },
      create: { studentId, examId, ...data },
      update: data,
    });
  }
  return rows.length;
}

/**
 * One class's results in one exam for the analyser: the saved snapshots when the
 * class is finalized (or the exam was deleted), otherwise the live marks.
 */
async function classRows(prisma, examId, classId) {
  const saved = await prisma.resultSnapshot.findMany({
    where: { examId, classId },
    include: { student: { select: { name: true, rollNumber: true } } },
  });
  if (saved.length) {
    return saved.map(({ student, ...s }) => ({ ...s, studentName: student.name, rollNumber: student.rollNumber }));
  }
  return buildRows(prisma, examId, classId);
}

/** Classes that take part in an exam. */
async function classesOfExam(prisma, examId) {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { enrollments: true } });
  if (!exam) return [];
  return exam.examType === 'INTERNAL_EXAM' ? exam.enrollments.map((e) => e.classId) : [exam.classId].filter(Boolean);
}

/** Snapshot every class of an exam (used before deleting it). */
async function snapshotExam(prisma, examId) {
  let saved = 0;
  for (const classId of await classesOfExam(prisma, examId)) saved += await snapshotClass(prisma, examId, classId);
  return saved;
}

/**
 * Start-up catch-up: snapshot finalized classes that don't have one yet
 * (exams finalized before the analyser existed). Cheap once everything is saved.
 */
async function backfillSnapshots(prisma) {
  const exams = await prisma.exam.findMany({
    where: { status: { in: ['Open', 'Closed'] } },
    include: { enrollments: true },
  });
  let saved = 0;
  for (const exam of exams) {
    const finalized = exam.examType === 'INTERNAL_EXAM'
      ? exam.enrollments.filter((e) => e.status === 'Finalized' || exam.status === 'Closed').map((e) => e.classId)
      : exam.status === 'Closed' ? [exam.classId].filter(Boolean) : [];
    for (const classId of finalized) {
      const have = await prisma.resultSnapshot.count({ where: { examId: exam.id, classId } });
      if (!have) saved += await snapshotClass(prisma, exam.id, classId);
    }
  }
  if (saved) console.log(`[snapshots] saved ${saved} result snapshots for finalized exams`);
  return saved;
}

module.exports = { ranks, buildRows, classRows, snapshotClass, snapshotExam, backfillSnapshots, classesOfExam };
