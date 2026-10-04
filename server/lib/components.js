/**
 * components.js — main mark + extra parts (Reading / Writing / Dictation) for subjects.
 *
 * A subject can carry extra parts (Subject.components, e.g. ["Reading", "Writing"]).
 * For such a subject, each exam stores ExamSubjectConfig.componentMaxMarks like
 *   { Main: 50, Reading: 5, Writing: 5 }
 * where "Main" is the subject's own paper and maxMarks is the sum. A part left
 * out of componentMaxMarks is simply not assessed in that exam.
 * Each student's Mark.componentMarks holds the same keys, and marksObtained is
 * their sum once every key is entered.
 *
 * Everything that totals, ranks or grades keeps using maxMarks / marksObtained,
 * so only screens that show the breakdown need to know about parts.
 */

const { Prisma } = require('@prisma/client');

const MAIN = 'Main';
const PARTS = ['Reading', 'Writing', 'Dictation'];
const ALL_KEYS = [MAIN, ...PARTS];

/** Error carrying an HTTP 400 so controllers can pass the message straight to the client. */
class ComponentError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const isBlank = (v) => v === null || v === undefined || v === '';

/** Keys of a componentMaxMarks / componentMarks object, in display order (Main first). */
const partKeys = (obj) => (obj ? ALL_KEYS.filter((k) => k in obj) : []);

/** Clean a requested parts list down to known part names, in standard order. */
function normalizeComponents(input) {
  const list = Array.isArray(input) ? input : [];
  return PARTS.filter((p) => list.includes(p));
}

/**
 * Validate max marks for a subject with extra parts, e.g. { Main: 50, Reading: 5, Writing: '' }.
 * Main is required and > 0. Each allowed part is optional: blank or 0 leaves it out of this exam.
 * Returns { componentMaxMarks, maxMarks }; componentMaxMarks is null when no part is included,
 * so the exam treats the subject as a plain single mark.
 */
function parseComponentMaxMarks(input, subjectName = 'this subject', allowedParts = PARTS) {
  const src = input && typeof input === 'object' ? input : {};
  const main = Number(src[MAIN]);
  if (isBlank(src[MAIN]) || isNaN(main) || main <= 0) {
    throw new ComponentError(`Max marks for ${subjectName} must be greater than 0.`);
  }
  const componentMaxMarks = { [MAIN]: main };
  let maxMarks = main;
  for (const part of normalizeComponents(allowedParts)) {
    if (isBlank(src[part]) || Number(src[part]) === 0) continue; // not assessed in this exam
    const val = Number(src[part]);
    if (isNaN(val) || val < 0) {
      throw new ComponentError(`${part} max marks for ${subjectName} must be a positive number.`);
    }
    componentMaxMarks[part] = val;
    maxMarks += val;
  }
  return { componentMaxMarks: partKeys(componentMaxMarks).length > 1 ? componentMaxMarks : null, maxMarks };
}

/**
 * Validate a student's marks against componentMaxMarks. Keys may be left blank while a
 * teacher is still entering them. Returns { componentMarks, marksObtained } where
 * marksObtained is the sum, or null if any key is still blank.
 */
function parseComponentMarks(input, componentMaxMarks) {
  const componentMarks = {};
  let total = 0;
  let complete = true;
  for (const key of partKeys(componentMaxMarks)) {
    const raw = input ? input[key] : null;
    if (isBlank(raw)) {
      componentMarks[key] = null;
      complete = false;
      continue;
    }
    const val = Number(raw);
    const max = componentMaxMarks[key];
    const label = key === MAIN ? 'Marks' : key;
    if (isNaN(val) || val < 0 || val > max) {
      throw new ComponentError(`${label} must be between 0 and ${max}.`);
    }
    componentMarks[key] = val;
    total += val;
  }
  return { componentMarks, marksObtained: complete ? total : null };
}

/** Same data, compared key by key (Json columns come back as plain objects). */
function sameComponentMarks(a, b) {
  return ALL_KEYS.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}

/**
 * Request body → ExamSubjectConfig update data, for teachers editing max marks.
 * Teachers get the same choice as the admin: { componentMaxMarks } with the main mark
 * plus any of the subject's ticked parts (blank = not in this exam), or { maxMarks }
 * for a subject without parts. Returns { maxMarks, componentMaxMarks } where
 * componentMaxMarks is null when no part is included.
 * `config` must include its subject.
 */
function maxMarksUpdate(config, body) {
  // Parts the teacher may use: the subject's ticked parts, plus any already in this exam.
  const allowed = normalizeComponents([
    ...(config.subject?.components || []),
    ...partKeys(config.componentMaxMarks),
  ]);
  if (body.componentMaxMarks && typeof body.componentMaxMarks === 'object') {
    return parseComponentMaxMarks(body.componentMaxMarks, config.subject?.name, allowed);
  }
  const maxMarks = Number(body.maxMarks);
  if (isBlank(body.maxMarks) || isNaN(maxMarks) || maxMarks <= 0) {
    throw new ComponentError('Invalid max marks value.');
  }
  return { maxMarks, componentMaxMarks: null };
}

/**
 * After an exam's max marks change for one subject, bring every student's saved
 * marks in line with the new set of parts:
 *  - marks typed before parts existed become the Main mark;
 *  - parts no longer in the exam are dropped;
 *  - the total is recomputed, and is empty until every part is filled
 *    (so nothing can be submitted with a part missing).
 * Returns the Prisma update operations (run them in the same transaction).
 */
function reconcileMarkOps(prisma, marks, componentMaxMarks) {
  const ops = [];
  for (const m of marks) {
    let componentMarks;
    let marksObtained;
    if (componentMaxMarks) {
      const base = m.componentMarks || (m.marksObtained === null ? {} : { [MAIN]: m.marksObtained });
      componentMarks = {};
      let total = 0;
      let complete = true;
      for (const key of partKeys(componentMaxMarks)) {
        const v = base[key] ?? null;
        componentMarks[key] = v;
        if (v === null) complete = false; else total += v;
      }
      marksObtained = complete ? total : null;
    } else {
      if (!m.componentMarks) continue; // already a single mark
      componentMarks = null;
      marksObtained = m.componentMarks[MAIN] ?? m.marksObtained;
    }
    if (marksObtained === m.marksObtained && sameComponentMarks(componentMarks, m.componentMarks)
        && (componentMarks === null) === (m.componentMarks === null)) continue;
    ops.push(prisma.mark.update({
      where: { id: m.id },
      data: { marksObtained, componentMarks: componentMarks ?? Prisma.DbNull },
    }));
  }
  return ops;
}


module.exports = {
  MAIN,
  PARTS,
  ComponentError,
  partKeys,
  normalizeComponents,
  parseComponentMaxMarks,
  parseComponentMarks,
  sameComponentMarks,
  maxMarksUpdate,
  reconcileMarkOps,
};
