/**
 * grades.js — the school's grading scale (AP State, A1–E) in one place.
 * Keep in sync with client/src/utils/grades.js.
 *
 *   A1 91–100 → 10   A2 81–90 → 9   B1 71–80 → 8   B2 61–70 → 7
 *   C1 51–60  → 6    C2 41–50 → 5   D  35–40 → 4   E  below 35 → 0
 */

const BANDS = [
  { min: 91, grade: 'A1', points: 10 },
  { min: 81, grade: 'A2', points: 9 },
  { min: 71, grade: 'B1', points: 8 },
  { min: 61, grade: 'B2', points: 7 },
  { min: 51, grade: 'C1', points: 6 },
  { min: 41, grade: 'C2', points: 5 },
  { min: 35, grade: 'D',  points: 4 },
  { min: 0,  grade: 'E',  points: 0 },
];

/** Grade band for a percentage (0–100). Percentages are rounded to whole numbers first, so 90.5 → A1. */
function bandFor(percentage) {
  const pct = Math.round(Number(percentage) || 0);
  return BANDS.find((b) => pct >= b.min);
}

const gradeFor = (percentage) => bandFor(percentage).grade;
const pointsFor = (percentage) => bandFor(percentage).points;

module.exports = { BANDS, gradeFor, pointsFor };
