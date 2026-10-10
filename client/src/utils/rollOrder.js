// Students are listed by roll number. Roll numbers start out in alphabetical order
// (Class Hub → "Renumber A–Z"); if the admin changes one, the student moves there.
// Mirrors server/lib/rollOrder.js.

/** Roll number order: numeric where possible ("2" before "10"), then name. */
export const byRoll = (a, b) =>
  String(a.rollNumber).localeCompare(String(b.rollNumber), undefined, { numeric: true })
  || a.name.localeCompare(b.name);

/** Next free roll number for a new student, zero-padded like the rest ("031"). */
export function nextRoll(students) {
  const max = students.reduce((m, s) => Math.max(m, parseInt(s.rollNumber, 10) || 0), 0);
  return String(max + 1).padStart(Math.max(3, String(students.length + 1).length), '0');
}
