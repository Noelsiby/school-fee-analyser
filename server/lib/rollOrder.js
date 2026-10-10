/**
 * rollOrder.js — students are listed by roll number everywhere.
 * Roll numbers start out in alphabetical order (see renumberByName); if the admin
 * changes a roll number, the student simply moves to that position.
 */

/** Roll number order: numeric where possible ("2" before "10", "007" == "7"), then name. */
const byRoll = (a, b) =>
  String(a.rollNumber).localeCompare(String(b.rollNumber), undefined, { numeric: true })
  || a.name.localeCompare(b.name);

/** Alphabetical order used when (re)numbering: case-insensitive, then by id for stable ties. */
const byName = (a, b) =>
  a.name.trim().localeCompare(b.name.trim(), undefined, { sensitivity: 'base' }) || a.id - b.id;

/** "1" → "001": roll numbers are zero-padded to 3 digits (more if the class is bigger). */
const formatRoll = (n, total) => String(n).padStart(Math.max(3, String(total).length), '0');

/**
 * Plan for numbering a class alphabetically: [{ id, name, from, to }] for every student.
 */
function renumberPlan(students) {
  const sorted = [...students].sort(byName);
  return sorted.map((s, i) => ({ id: s.id, name: s.name, from: s.rollNumber, to: formatRoll(i + 1, sorted.length) }));
}

module.exports = { byRoll, byName, formatRoll, renumberPlan };
