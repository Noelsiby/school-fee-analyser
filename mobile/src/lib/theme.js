// Colours and spacing shared by every screen (same navy + gold as the school portal).
export const C = {
  navy: '#1e3a8a',
  navyLight: '#eef2ff',
  gold: '#d4a017',
  ink: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  bg: '#f4f6fb',
  card: '#ffffff',
  green: '#16a34a',
  greenBg: '#dcfce7',
  red: '#dc2626',
  redBg: '#fee2e2',
  amber: '#d97706',
  amberBg: '#fef3c7',
  blue: '#2563eb',
  blueBg: '#dbeafe',
};

/** Badge colours for a grade: A green, B/C blue, D amber, fail red. */
export function gradeColors(grade) {
  if (!grade) return { fg: C.muted, bg: C.line };
  if (grade.startsWith('A')) return { fg: '#166534', bg: C.greenBg };
  if (grade.startsWith('B') || grade.startsWith('C')) return { fg: '#1e40af', bg: C.blueBg };
  if (grade === 'D') return { fg: '#92400e', bg: C.amberBg };
  return { fg: '#991b1b', bg: C.redBg };
}
