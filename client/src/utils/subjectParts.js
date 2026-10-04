// Main mark + extra parts (Reading / Writing / Dictation) for subjects.
// Mirrors server/lib/components.js — keep the names in sync.
//
// A subject lists its parts in subject.components, e.g. ['Reading', 'Writing'].
// Per exam, max marks look like { Main: 50, Reading: 5, Writing: 5 } and the
// subject total is their sum. A part left out of an exam is simply absent.

export const MAIN = 'Main';
export const PARTS = ['Reading', 'Writing', 'Dictation'];
const ALL_KEYS = [MAIN, ...PARTS];

const isObj = (v) => v !== null && typeof v === 'object';

/** Does this subject have extra parts? */
export const hasParts = (subject) => (subject?.components?.length ?? 0) > 0;

/** Keys of a max-marks / marks object in display order (Main first). */
export const partKeys = (obj) => (isObj(obj) ? ALL_KEYS.filter(k => k in obj) : []);

/** "+ Reading · Writing" label for a subject's parts. */
export const partsLabel = (components) => (components?.length ? `+ ${components.join(' · ')}` : '');

/** Column / field label for a key: the subject name for Main, the part name otherwise. */
export const keyLabel = (key, subjectName = 'Main') => (key === MAIN ? subjectName : key);

/** Sum of a max-marks value: a number, or { Main, Reading, ... }. Blank parts count as 0. */
export function totalOf(value) {
  if (isObj(value)) return partKeys(value).reduce((sum, k) => sum + (Number(value[k]) || 0), 0);
  return Number(value) || 0;
}

/**
 * Max-marks value to show for a subject in an exam form, given what is saved for that exam.
 * Subjects with parts get { Main, ...parts }; ordinary subjects a number.
 * Part max marks are never pre-filled: the admin types each one, and a part left
 * blank is not in that exam.
 * - Never configured: Main 100, parts blank.
 * - Configured before the subject had parts: keep the saved number as Main, parts blank.
 * - Configured with parts: what was saved; parts left out of the exam stay blank.
 */
export function initialMaxMarks(subject, saved) {
  if (!hasParts(subject)) return isObj(saved) ? totalOf(saved) : (saved ?? 100);
  const value = { [MAIN]: isObj(saved) ? saved[MAIN] : (saved ?? 100) };
  subject.components.forEach(p => {
    value[p] = isObj(saved) ? (saved[p] ?? '') : '';
  });
  return value;
}

/** Saved ExamSubjectConfig → value for initialMaxMarks(). */
export const savedMaxMarks = (config) => config?.componentMaxMarks || config?.maxMarks;

/** Form value → one entry of the `configs` array the admin API expects. */
export function toConfigPayload(subject, value) {
  if (hasParts(subject)) {
    const v = isObj(value) ? value : { [MAIN]: value };
    const componentMaxMarks = { [MAIN]: Number(v[MAIN]) };
    subject.components.forEach(p => { componentMaxMarks[p] = v[p] === '' || v[p] == null ? 0 : Number(v[p]); });
    return { subjectId: subject.id, componentMaxMarks };
  }
  return { subjectId: subject.id, maxMarks: Number(value) };
}

/**
 * A student's saved marks as { Main, ...parts } for the keys in this exam.
 * Marks entered before the subject had parts have no breakdown yet: their
 * single mark becomes the Main mark so nothing already typed is lost.
 */
export function marksForKeys(markRecord, keys) {
  const saved = markRecord?.componentMarks;
  return Object.fromEntries(keys.map(k => [
    k,
    saved ? (saved[k] ?? '') : (k === MAIN ? (markRecord?.marksObtained ?? '') : ''),
  ]));
}

/** Short "Main 40 · R 5 · W 4" text for a marks / max-marks object (blank entries show as –). */
export function partsSummary(obj) {
  if (!isObj(obj)) return '';
  return partKeys(obj).map(k => `${k === MAIN ? 'Main' : k.charAt(0)} ${obj[k] ?? '–'}`).join(' · ');
}

/**
 * "Apply to all": copy the filled-in boxes of `fields` ({ Main, Reading, ... }) onto a
 * subject's current max-marks value. Empty boxes leave that value as it is.
 * Ordinary subjects take the Main box as their single max mark.
 */
export function applyMaxMarks(subject, current, fields) {
  const filled = (k) => fields[k] !== '' && fields[k] != null;
  if (!hasParts(subject)) return filled(MAIN) ? fields[MAIN] : current;
  const value = isObj(current) ? { ...current } : initialMaxMarks(subject, current);
  if (filled(MAIN)) value[MAIN] = fields[MAIN];
  subject.components.forEach(p => { if (filled(p)) value[p] = fields[p]; });
  return value;
}
