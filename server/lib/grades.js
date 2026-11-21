/**
 * grades.js — the school's grading scale in one place. The school decides it (Admin → Grading):
 *
 *   outOf   the total the grades are written for, e.g. 100 or 50
 *   bands   [{ grade, from, to, points, pass }]  ranges in MARKS out of `outOf`, e.g. A1 46–50
 *
 * A subject with a different total is scaled first: 22/25 out of a scale of 50 = 44 marks.
 * Marks are rounded to whole numbers (44.5 → 45) before looking up the grade.
 * `pass` says which grades count as passed; the lowest pass grade sets the pass mark.
 *
 * Every band also carries `min`: where it starts as a percentage (from / outOf × 100). The rest
 * of the app (analyser, results, app) uses percentages, so it keeps working unchanged.
 * Stored in app_settings under "gradeScale" as { outOf, bands }. Older saved scales
 * ([{ grade, min, points }], percentages) are read as a scale out of 100.
 * Keep in sync with client/src/utils/grades.js.
 */

const SETTING_KEY = 'gradeScale';

const round2 = (n) => Math.round(n * 100) / 100;

/** Fill in outOf and min on each band. */
function finish(bands, outOf) {
  return bands.map((b) => ({ ...b, outOf, min: round2((b.from / outOf) * 100) }));
}

// Used until the school saves its own scale (out of 100).
const DEFAULT_BANDS = finish([
  { grade: 'A1', from: 91, to: 100, points: 10, pass: true },
  { grade: 'A2', from: 81, to: 90, points: 9, pass: true },
  { grade: 'B1', from: 71, to: 80, points: 8, pass: true },
  { grade: 'B2', from: 61, to: 70, points: 7, pass: true },
  { grade: 'C1', from: 51, to: 60, points: 6, pass: true },
  { grade: 'C2', from: 41, to: 50, points: 5, pass: true },
  { grade: 'D', from: 35, to: 40, points: 4, pass: true },
  { grade: 'E', from: 0, to: 34, points: 0, pass: false },
], 100);

// The scale in use. Loaded from the database at start-up and after every save.
let BANDS = DEFAULT_BANDS;

/** Grade band for a percentage (0–100): scaled to the scale's total, rounded, then looked up. */
function bandFor(percentage, bands = BANDS) {
  const outOf = bands[0]?.outOf || 100;
  const marks = Math.round(((Number(percentage) || 0) / 100) * outOf);
  return bands.find((b) => marks >= (b.from ?? b.min)) || bands[bands.length - 1];
}

/** Lowest percentage that still reaches a band (after rounding), e.g. 90.5 for A1 91–100 out of 100. */
const thresholdPct = (b) => (((b.from ?? b.min) - 0.5) / (b.outOf || 100)) * 100;

const gradeFor = (percentage, bands) => bandFor(percentage, bands).grade;
const pointsFor = (percentage, bands) => bandFor(percentage, bands).points;
/** Pass mark as a percentage: where the lowest pass grade starts (0 if every grade passes). */
function passMark(bands = BANDS) {
  const passing = bands.filter((b) => b.pass !== false);
  if (!passing.length) return 100;
  if (passing.length === bands.length) return 0;
  return passing[passing.length - 1].min;
}
const currentScale = () => BANDS;

/** Old saved format ([{ grade, min, points }] in %) → bands out of 100. */
function fromOldFormat(rows) {
  const sorted = [...rows].sort((a, b) => Number(b.min) - Number(a.min));
  return {
    outOf: 100,
    rows: sorted.map((r, i) => ({
      grade: r.grade, from: Number(r.min), to: i === 0 ? 100 : Number(sorted[i - 1].min) - 1,
      points: r.points, pass: i < sorted.length - 1,
    })),
  };
}

/**
 * Check and tidy a scale sent by the admin. Returns { bands, outOf } or { error }.
 * Accepts { outOf, bands: [{ grade, from, to, points, pass }] }, or the old array of { grade, min, points }.
 */
function parseScale(input) {
  let outOf, rows;
  if (Array.isArray(input) && input.length && input.every((r) => r && r.from === undefined && r.min !== undefined)) {
    ({ outOf, rows } = fromOldFormat(input));
  } else {
    outOf = Number(input?.outOf);
    rows = input?.bands;
  }
  if (!Number.isInteger(outOf) || outOf < 1 || outOf > 1000) return { error: '"Out of" must be a whole number from 1 to 1000.' };
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 15) return { error: 'The scale needs between 2 and 15 grades.' };

  const bands = [];
  for (const row of rows) {
    const grade = String(row?.grade ?? '').trim().toUpperCase();
    const from = Number(row?.from), to = Number(row?.to), points = Number(row?.points);
    if (!grade || grade.length > 6) return { error: 'Every grade needs a short name (up to 6 characters), like A1.' };
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > outOf) {
      return { error: `Grade ${grade}: "from" and "to" must be whole numbers from 0 to ${outOf}.` };
    }
    if (from > to) return { error: `Grade ${grade}: "from" (${from}) is bigger than "to" (${to}).` };
    if (!Number.isFinite(points) || points < 0 || points > 100) return { error: `Grade ${grade}: points must be a number from 0 to 100.` };
    bands.push({ grade, from, to, points: round2(points), pass: row?.pass !== false });
  }
  bands.sort((a, b) => b.from - a.from);

  const names = new Set();
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (names.has(b.grade)) return { error: `Grade ${b.grade} is listed twice.` };
    names.add(b.grade);
    if (i === 0 && b.to !== outOf) return { error: `The top grade (${b.grade}) must go up to ${outOf}.` };
    if (i > 0) {
      const above = bands[i - 1];
      if (b.to >= above.from) return { error: `${above.grade} and ${b.grade} overlap: ${b.grade} goes up to ${b.to} but ${above.grade} starts at ${above.from}.` };
      if (b.to < above.from - 1) return { error: `${b.to + 1 === above.from - 1 ? `Mark ${b.to + 1} has` : `Marks ${b.to + 1} to ${above.from - 1} have`} no grade (between ${b.grade} and ${above.grade}).` };
      if (b.pass && !above.pass) return { error: `${b.grade} is marked Pass but the higher grade ${above.grade} is Fail.` };
    }
  }
  if (bands[bands.length - 1].from !== 0) return { error: `The lowest grade (${bands[bands.length - 1].grade}) must start at 0.` };
  return { bands: finish(bands, outOf), outOf };
}

/** Load the saved scale (falls back to the default if none is saved or the table is missing). */
async function loadGradeScale(prisma) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    const parsed = row ? parseScale(row.value) : null;
    BANDS = parsed && parsed.bands ? parsed.bands : DEFAULT_BANDS;
  } catch (e) {
    console.error('[grades] could not load grade scale, using default:', e.message);
    BANDS = DEFAULT_BANDS;
  }
  return BANDS;
}

async function saveGradeScale(prisma, bands, outOf) {
  const value = { outOf, bands: bands.map(({ grade, from, to, points, pass }) => ({ grade, from, to, points, pass })) };
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  });
  BANDS = bands;
  return BANDS;
}

module.exports = {
  DEFAULT_BANDS, currentScale, gradeFor, pointsFor, passMark, thresholdPct,
  parseScale, loadGradeScale, saveGradeScale,
};
