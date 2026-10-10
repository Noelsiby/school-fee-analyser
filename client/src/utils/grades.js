// The school's grading scale (AP State, A1–E). Mirrors server/lib/grades.js.
//   A1 91–100 → 10   A2 81–90 → 9   B1 71–80 → 8   B2 61–70 → 7
//   C1 51–60  → 6    C2 41–50 → 5   D  35–40 → 4   E  below 35 → 0

export const BANDS = [
  { min: 91, grade: 'A1', points: 10 },
  { min: 81, grade: 'A2', points: 9 },
  { min: 71, grade: 'B1', points: 8 },
  { min: 61, grade: 'B2', points: 7 },
  { min: 51, grade: 'C1', points: 6 },
  { min: 41, grade: 'C2', points: 5 },
  { min: 35, grade: 'D',  points: 4 },
  { min: 0,  grade: 'E',  points: 0 },
];

const bandFor = (percentage) => BANDS.find(b => Math.round(Number(percentage) || 0) >= b.min);

export const gradeFor = (percentage) => bandFor(percentage).grade;
export const pointsFor = (percentage) => bandFor(percentage).points;

// Badge colour for a grade: green for A1/A2, blue for B and C grades, amber for D, red for E.
export function gradeTone(grade) {
  if (!grade || grade === '—') return 'gray';
  if (grade.startsWith('A')) return 'green';
  if (grade.startsWith('B') || grade.startsWith('C')) return 'blue';
  if (grade === 'D') return 'amber';
  return 'red';
}
