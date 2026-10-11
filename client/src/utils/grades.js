// The school's grading scale. Mirrors server/lib/grades.js.
// Grades go by percentage, so one scale works for exams out of 100, 50 or 30.
// The admin can change it (Admin → Grading); useGradeScale() loads the saved one.
// Default (AP State):
//   A1 91–100 → 10   A2 81–90 → 9   B1 71–80 → 8   B2 61–70 → 7
//   C1 51–60  → 6    C2 41–50 → 5   D  35–40 → 4   E  below 35 → 0
import { useEffect, useState } from 'react';

export const DEFAULT_BANDS = [
  { min: 91, grade: 'A1', points: 10 },
  { min: 81, grade: 'A2', points: 9 },
  { min: 71, grade: 'B1', points: 8 },
  { min: 61, grade: 'B2', points: 7 },
  { min: 51, grade: 'C1', points: 6 },
  { min: 41, grade: 'C2', points: 5 },
  { min: 35, grade: 'D',  points: 4 },
  { min: 0,  grade: 'E',  points: 0 },
];

const bandFor = (percentage, bands = DEFAULT_BANDS) =>
  bands.find(b => Math.round(Number(percentage) || 0) >= b.min) || bands[bands.length - 1];

export const gradeFor = (percentage, bands) => bandFor(percentage, bands).grade;
export const pointsFor = (percentage, bands) => bandFor(percentage, bands).points;

/** Lowest passing percentage: where the grade above the last (fail) grade starts. */
export const passMarkOf = (bands = DEFAULT_BANDS) => (bands.length > 1 ? bands[bands.length - 2].min : 0);

/** "91–100", "35–40", "Below 35" for each grade of a scale. */
export const rangeLabel = (bands, i) => {
  const b = bands[i];
  if (b.min === 0 && i > 0) return `Below ${bands[i - 1].min}`;
  const upper = i === 0 ? 100 : bands[i - 1].min - 1;
  return b.min === upper ? `${b.min}` : `${b.min}–${upper}`;
};

// One fetch per page load; saving on the Grading page updates it for everyone on this page.
let cached = null;
let pending = null;
const listeners = new Set();

export function setGradeScale(bands) {
  cached = bands;
  listeners.forEach(fn => fn(bands));
}

function fetchScale() {
  if (!pending) {
    pending = fetch('/api/public/grade-scale')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.bands) setGradeScale(d.bands); })
      .catch(() => {})
      .finally(() => { pending = null; });
  }
  return pending;
}

/** The grading scale in use (the default until the saved one has loaded). */
export function useGradeScale() {
  const [bands, setBands] = useState(cached || DEFAULT_BANDS);
  useEffect(() => {
    listeners.add(setBands);
    if (cached) setBands(cached); else fetchScale();
    return () => listeners.delete(setBands);
  }, []);
  return bands;
}

// Badge colour for a grade: green for A grades, blue for B and C, amber for D, red for the fail grade.
export function gradeTone(grade) {
  if (!grade || grade === '—') return 'gray';
  if (grade.startsWith('A')) return 'green';
  if (grade.startsWith('B') || grade.startsWith('C')) return 'blue';
  if (grade === 'D') return 'amber';
  return 'red';
}
