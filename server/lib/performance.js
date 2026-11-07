/**
 * performance.js — turns a student's saved results (ResultSnapshot rows) into the
 * Performance Analyser: progress, class position, strong and weak subjects, marks
 * needed for the next grade, Reading/Writing/Dictation, consistency, personal best,
 * warning flags, achievements and a plain-English summary. No AI: simple rules.
 */

const { currentScale, passMark } = require('./grades');

const round1 = (n) => Math.round(n * 10) / 10;
const pctOf = (total, max) => (total === null || total === undefined || !max ? null : (total / max) * 100);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** "top 20%" style position, from rank among N. */
function position(rank, of) {
  if (!rank || !of) return null;
  if (rank === 1) return 'Top of the class';
  const top = Math.max(1, Math.ceil((rank / of) * 100 / 5) * 5); // round up to 5%
  return top <= 50 ? `Top ${top}% of the class` : `Bottom ${Math.max(5, 100 - top + 5)}% of the class`;
}

/**
 * Marks needed for the next one or two grades in a subject.
 * Percentages are rounded before grading, so a band starting at m% is reached at (m - 0.5)%.
 */
function nextGrades(total, max, bands = currentScale()) {
  if (total === null || !max) return [];
  const pct = Math.round((total / max) * 100);
  const above = bands.filter((b) => b.min > pct).sort((a, b) => a.min - b.min).slice(0, 2);
  return above.map((b) => {
    const need = Math.max(0, Math.ceil((((b.min - 0.5) / 100) * max - total) * 2) / 2); // to the nearest half mark
    return { grade: b.grade, marksNeeded: need };
  });
}

/** Steadiness of percentages across exams (needs at least 3). */
function consistency(pcts) {
  if (pcts.length < 3) return null;
  const m = avg(pcts);
  const sd = Math.sqrt(avg(pcts.map((p) => (p - m) ** 2)));
  return { spread: round1(sd), label: sd < 5 ? 'Steady' : sd < 10 ? 'Some ups and downs' : 'Up and down' };
}

/**
 * Build the analysis.
 * @param snaps   the student's snapshots, any order
 * @param ctx     { classGains: Map(studentId → gain) for the latest exam's class (for "most improved") }
 */
function analyse(snaps, ctx = {}) {
  const pass = passMark();
  const bands = currentScale();
  const topGrade = bands[0]?.grade;
  const list = [...snaps].sort((a, b) => new Date(a.examDate) - new Date(b.examDate));
  const done = list.filter((s) => s.complete && s.percentage !== null);

  const exams = list.map((s) => ({
    examId: s.examId,
    examName: s.examName,
    date: s.examDate,
    className: s.className,
    complete: s.complete,
    percentage: s.percentage,
    grade: s.grade,
    gpa: s.gpa,
    rank: s.rank,
    rankedCount: s.rankedCount,
    position: position(s.rank, s.rankedCount),
    classAverage: s.classAverage,
    classHighest: s.classHighest,
  }));

  const latest = done[done.length - 1] || null;
  const previous = done.length > 1 ? done[done.length - 2] : null;

  // ── Subjects across exams ──
  const bySubject = new Map();
  for (const s of list) {
    for (const sub of s.subjects || []) {
      if (!bySubject.has(sub.name)) bySubject.set(sub.name, []);
      bySubject.get(sub.name).push({
        examName: s.examName,
        examId: s.examId,
        total: sub.total,
        maxMarks: sub.maxMarks,
        grade: sub.grade,
        pct: pctOf(sub.total, sub.maxMarks),
        classPct: pctOf(sub.classAverage, sub.maxMarks),
        parts: sub.parts,
        partMax: sub.partMax,
      });
    }
  }
  const overallAvg = avg(done.map((s) => s.percentage));
  const subjects = [...bySubject].map(([name, hist]) => {
    const scored = hist.filter((h) => h.pct !== null);
    const last = scored[scored.length - 1] || null;
    const prev = scored.length > 1 ? scored[scored.length - 2] : null;
    const latestInLatestExam = latest ? hist.find((h) => h.examId === latest.examId) : null;
    return {
      name,
      history: hist.map((h) => ({ examName: h.examName, pct: h.pct === null ? null : round1(h.pct), grade: h.grade, total: h.total, maxMarks: h.maxMarks })),
      average: scored.length ? round1(avg(scored.map((h) => h.pct))) : null,
      latest: last ? { pct: round1(last.pct), grade: last.grade, total: last.total, maxMarks: last.maxMarks, examName: last.examName } : null,
      change: last && prev ? round1(last.pct - prev.pct) : null,
      vsClass: last && last.classPct !== null ? round1(last.pct - last.classPct) : null,
      failedCount: scored.filter((h) => Math.round(h.pct) < pass).length,
      nextGrades: latestInLatestExam ? nextGrades(latestInLatestExam.total, latestInLatestExam.maxMarks, bands) : [],
    };
  });

  const ranked = subjects.filter((s) => s.average !== null).sort((a, b) => b.average - a.average);
  const strengths = ranked
    .filter((s) => overallAvg === null || s.average >= overallAvg + 3 || s.average >= 80)
    .slice(0, 3).map((s) => s.name);
  const weaknesses = ranked.slice().reverse()
    .filter((s) => !strengths.includes(s.name) && (s.average < pass + 10 || (overallAvg !== null && s.average <= overallAvg - 5)))
    .slice(0, 3).map((s) => s.name);

  // ── Reading / Writing / Dictation (and the main mark) across exams ──
  const parts = [];
  for (const [name, hist] of bySubject) {
    const sums = {};
    for (const h of hist) {
      if (!h.parts || !h.partMax) continue;
      for (const [part, mark] of Object.entries(h.parts)) {
        const max = h.partMax[part];
        if (mark === null || mark === undefined || !max) continue;
        (sums[part] ||= []).push((mark / max) * 100);
      }
    }
    const rows = Object.entries(sums).map(([part, ps]) => ({ part, average: round1(avg(ps)), exams: ps.length }));
    if (rows.filter((r) => r.part !== 'Main').length) {
      const extra = rows.filter((r) => r.part !== 'Main').sort((a, b) => a.average - b.average);
      parts.push({
        subject: name,
        parts: rows,
        weakest: extra.length > 1 && extra[0].average < extra[extra.length - 1].average - 5 ? extra[0].part : null,
        strongest: extra.length > 1 ? extra[extra.length - 1].part : null,
      });
    }
  }

  // ── Flags ──
  const flags = [];
  if (latest && previous && latest.percentage - previous.percentage <= -10) {
    flags.push({ tone: 'red', text: `Dropped ${round1(previous.percentage - latest.percentage)}% since ${previous.examName}` });
  }
  for (const s of subjects) {
    if (s.failedCount >= 2) flags.push({ tone: 'red', text: `Below the pass mark in ${s.name} in ${s.failedCount} exams` });
  }
  if (latest && latest.percentage !== null && Math.round(latest.percentage) < pass) {
    flags.push({ tone: 'red', text: `Below the pass mark overall in ${latest.examName}` });
  }

  // ── Achievements ──
  const achievements = [];
  const latestSubs = latest?.subjects || [];
  if (latest && latestSubs.length && latestSubs.every((s) => s.grade === topGrade)) {
    achievements.push({ icon: '⭐', text: `${topGrade} in every subject (${latest.examName})` });
  }
  if (latest && latest.rank === 1) achievements.push({ icon: '🏆', text: `First in class (${latest.examName})` });
  for (const s of latestSubs) {
    if (s.total !== null && s.maxMarks && s.total === s.maxMarks) achievements.push({ icon: '💯', text: `Full marks in ${s.name} (${latest.examName})` });
  }
  const rising = done.length >= 3 && done.slice(-3).every((s, i, a) => i === 0 || s.percentage > a[i - 1].percentage);
  if (rising) achievements.push({ icon: '📈', text: 'Improved in each of the last 3 exams' });
  if (ctx.classGains && latest && previous) {
    const gains = [...ctx.classGains.values()].filter((g) => g !== null);
    const mine = ctx.classGains.get(latest.studentId);
    if (mine !== null && mine !== undefined && mine > 0 && gains.length >= 3 && mine === Math.max(...gains)) {
      achievements.push({ icon: '🏅', text: `Most improved in class (${latest.examName})` });
    }
  }
  const best = done.length ? done.reduce((a, b) => (b.percentage > a.percentage ? b : a)) : null;
  const personalBest = best && done.length > 1 ? { examName: best.examName, percentage: best.percentage, isLatest: best === latest } : null;
  if (personalBest?.isLatest) achievements.push({ icon: '🎉', text: `Personal best so far (${best.examName}, ${best.percentage}%)` });

  // ── Summary in plain English ──
  const lines = [];
  if (latest) {
    lines.push(`Latest: ${latest.examName}, ${latest.percentage}% (${latest.grade})${latest.rank ? `, rank ${latest.rank} of ${latest.rankedCount}` : ''}.`);
  }
  if (latest && previous) {
    const d = round1(latest.percentage - previous.percentage);
    const better = subjects.filter((s) => s.change !== null && s.change > 0).length;
    const withChange = subjects.filter((s) => s.change !== null).length;
    lines.push(`${d >= 0 ? 'Up' : 'Down'} ${Math.abs(d)}% since ${previous.examName}; improved in ${better} of ${withChange} subjects.`);
  }
  if (strengths.length) lines.push(`Strong: ${strengths.join(', ')}.`);
  if (weaknesses.length) lines.push(`Needs focus: ${weaknesses.join(', ')}.`);
  const weakPart = parts.find((p) => p.weakest);
  if (weakPart) lines.push(`In ${weakPart.subject}, ${weakPart.weakest} is the weakest part.`);

  return {
    passMark: pass,
    exams,
    latest: latest ? exams.find((e) => e.examId === latest.examId) : null,
    rankChange: latest && previous && latest.rank && previous.rank
      ? { from: previous.rank, to: latest.rank, fromExam: previous.examName, toExam: latest.examName }
      : null,
    subjects,
    strengths,
    weaknesses,
    parts,
    consistency: consistency(done.map((s) => s.percentage)),
    personalBest,
    flags,
    achievements,
    summary: lines.join(' '),
  };
}

/** Change in the latest exam vs each student's previous exam, for a class (→ Map studentId → gain). */
async function classGains(prisma, classId, examId) {
  const current = await prisma.resultSnapshot.findMany({ where: { classId, examId, complete: true } });
  const gains = new Map();
  for (const s of current) {
    const prev = await prisma.resultSnapshot.findFirst({
      where: { studentId: s.studentId, examId: { not: examId }, examDate: { lt: s.examDate }, complete: true },
      orderBy: { examDate: 'desc' },
    });
    gains.set(s.studentId, prev && s.percentage !== null && prev.percentage !== null ? round1(s.percentage - prev.percentage) : null);
  }
  return gains;
}

/**
 * Each note with how its subject (or the overall %) changed afterwards: from the last
 * exam before the note to the latest exam held after it.
 */
function notesWithFollowUp(notes, snaps) {
  const list = snaps.filter((s) => s.complete).sort((a, b) => new Date(a.examDate) - new Date(b.examDate));
  const pick = (s, subject) => {
    if (!subject) return s.percentage;
    const sub = (s.subjects || []).find((x) => x.name === subject);
    return sub ? pctOf(sub.total, sub.maxMarks) : null;
  };
  return notes.map((n) => {
    const at = new Date(n.createdAt);
    const before = list.filter((s) => new Date(s.examDate) <= at).pop();
    const after = list.filter((s) => new Date(s.examDate) > at).pop();
    const from = before ? pick(before, n.subject) : null;
    const to = after ? pick(after, n.subject) : null;
    return {
      ...n,
      followUp: from !== null && to !== null
        ? { fromExam: before.examName, toExam: after.examName, from: round1(from), to: round1(to), change: round1(to - from) }
        : null,
    };
  });
}

module.exports = { analyse, classGains, notesWithFollowUp, nextGrades, position, pctOf, round1 };
