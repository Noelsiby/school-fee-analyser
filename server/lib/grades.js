/**
 * grades.js — the school's grading scale in one place.
 *
 * Grades go by PERCENTAGE, so one scale works for every exam: 44/50, 88/100 and
 * 26.4/30 are all 88%. The admin can change the scale (Admin → Grading); it is
 * stored in app_settings under "gradeScale". Until then the AP State scale is used:
 *
 *   A1 91–100 → 10   A2 81–90 → 9   B1 71–80 → 8   B2 61–70 → 7
 *   C1 51–60  → 6    C2 41–50 → 5   D  35–40 → 4   E  below 35 → 0
 *
 * The last grade (from 0%) is the fail grade; the one above it sets the pass mark.
 * Keep in sync with client/src/utils/grades.js.
 */

const SETTING_KEY = 'gradeScale';

const DEFAULT_BANDS = [
  { min: 91, grade: 'A1', points: 10 },
  { min: 81, grade: 'A2', points: 9 },
  { min: 71, grade: 'B1', points: 8 },
  { min: 61, grade: 'B2', points: 7 },
  { min: 51, grade: 'C1', points: 6 },
  { min: 41, grade: 'C2', points: 5 },
  { min: 35, grade: 'D',  points: 4 },
  { min: 0,  grade: 'E',  points: 0 },
];

// The scale in use. Loaded from the database at start-up and after every save.
let BANDS = DEFAULT_BANDS;

/** Grade band for a percentage (0–100). Percentages are rounded to whole numbers first, so 90.5 → 91. */
function bandFor(percentage, bands = BANDS) {
  const pct = Math.round(Number(percentage) || 0);
  return bands.find((b) => pct >= b.min) || bands[bands.length - 1];
}

const gradeFor = (percentage, bands) => bandFor(percentage, bands).grade;
const pointsFor = (percentage, bands) => bandFor(percentage, bands).points;
/** Lowest passing percentage: where the grade above the fail grade starts. */
const passMark = (bands = BANDS) => (bands.length > 1 ? bands[bands.length - 2].min : 0);
const currentScale = () => BANDS;

/**
 * Check and tidy a scale sent by the admin. Returns { bands } or { error }.
 * Rows: { grade, min (whole %, 0–100), points }; sorted high → low; the last must start at 0.
 */
function parseScale(input) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 15) {
    return { error: 'The scale needs between 2 and 15 grades.' };
  }
  const bands = [];
  for (const row of input) {
    const grade = String(row?.grade ?? '').trim().toUpperCase();
    const min = Number(row?.min);
    const points = Number(row?.points);
    if (!grade || grade.length > 6) return { error: 'Every grade needs a short name (up to 6 characters), like A1.' };
    if (!Number.isInteger(min) || min < 0 || min > 100) return { error: `Grade ${grade}: "From %" must be a whole number from 0 to 100.` };
    if (!Number.isFinite(points) || points < 0 || points > 100) return { error: `Grade ${grade}: points must be a number from 0 to 100.` };
    bands.push({ min, grade, points: Math.round(points * 100) / 100 });
  }
  bands.sort((a, b) => b.min - a.min);
  const names = new Set();
  for (let i = 0; i < bands.length; i++) {
    if (names.has(bands[i].grade)) return { error: `Grade ${bands[i].grade} is listed twice.` };
    names.add(bands[i].grade);
    if (i > 0 && bands[i].min === bands[i - 1].min) {
      return { error: `Grades ${bands[i - 1].grade} and ${bands[i].grade} both start at ${bands[i].min}%.` };
    }
  }
  if (bands[bands.length - 1].min !== 0) {
    return { error: 'The lowest grade must start at 0% so every mark gets a grade.' };
  }
  return { bands };
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

async function saveGradeScale(prisma, bands) {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: bands },
    update: { value: bands },
  });
  BANDS = bands;
  return BANDS;
}

module.exports = {
  DEFAULT_BANDS, currentScale, gradeFor, pointsFor, passMark,
  parseScale, loadGradeScale, saveGradeScale,
};
