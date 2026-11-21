// The school's grading scale. Mirrors server/lib/grades.js.
// The school decides it (Admin → Grading): a total ("out of", e.g. 50) and grade ranges in marks
// (A1 46–50 …), which grades pass, and points. Marks of a subject with another total are scaled
// to that total and rounded before the grade is looked up. Each band also has `min` (where it
// starts as a %), used by pages that work in percentages. useGradeScale() loads the saved scale.
import { useEffect, useState } from 'react';

const finish = (bands, outOf) => bands.map((b) => ({ ...b, outOf, min: Math.round((b.from / outOf) * 10000) / 100 }));

// Used until the school's saved scale has loaded (out of 100).
export const DEFAULT_BANDS = finish([
  { grade: 'A1', from: 91, to: 100, points: 10, pass: true },
  { grade: 'A2', from: 81, to: 90, points: 9, pass: true },
  { grade: 'B1', from: 71, to: 80, points: 8, pass: true },
  { grade: 'B2', from: 61, to: 70, points: 7, pass: true },
  { grade: 'C1', from: 51, to: 60, points: 6, pass: true },
  { grade: 'C2', from: 41, to: 50, points: 5, pass: true },
  { grade: 'D', from: 35, to: 40, points: 4, pass: true },
  { grade: 'E', from: 0, to: 34, points: 0, pass: false },
], 100);

/** Percentage → grade band: scaled to the scale's total ("out of"), rounded, then looked up. */
const bandFor = (percentage, bands = DEFAULT_BANDS) => {
  const outOf = bands[0]?.outOf || 100;
  const marks = Math.round(((Number(percentage) || 0) / 100) * outOf);
  return bands.find((b) => marks >= (b.from ?? b.min)) || bands[bands.length - 1];
};

export const gradeFor = (percentage, bands) => bandFor(percentage, bands).grade;
export const pointsFor = (percentage, bands) => bandFor(percentage, bands).points;

/** Pass mark as a percentage: where the lowest pass grade starts (0 if every grade passes). */
export const passMarkOf = (bands = DEFAULT_BANDS) => {
  const passing = bands.filter((b) => b.pass !== false);
  if (!passing.length) return 100;
  if (passing.length === bands.length) return 0;
  return passing[passing.length - 1].min;
};

/** "46–50" (marks out of the scale's total) for each grade. */
export const rangeLabel = (bands, i) => {
  const b = bands[i];
  return b.from === b.to ? `${b.from}` : `${b.from}–${b.to}`;
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
