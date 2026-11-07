/**
 * periods.js — the school's period lists ("schedules"). Nothing is assumed: until the
 * admin sets them (Timetable → Periods) there are no periods.
 *
 * Stored in app_settings "periodSchedules":
 *   [{ key, name, classIds, periods: [{ key, label, start, end, isBreak }], dayCounts: { "6": 4 } }]
 *   - The FIRST schedule is the school's main one; classIds [] means "every class not in another list".
 *   - Other schedules list their classes, e.g. LKG–Class 2 with 5 periods.
 *   - dayCounts: on that weekday (0 = Sunday … 6 = Saturday) only the first N teaching periods happen.
 *
 * Teaching periods are keyed by position (P1, P2 …), so "Period 3" lines up across schedules
 * for teacher timetables and clash checks. Breaks are keyed B1, B2 ….
 */

const KEY = 'periodSchedules';
const OLD_KEY = 'periods'; // the single list used before schedules existed

/** Give teaching periods P1…Pn and breaks B1…Bn, in order. */
function withKeys(periods) {
  let t = 0, b = 0;
  return periods.map((p) => ({ ...p, key: p.isBreak ? `B${++b}` : `P${++t}` }));
}

async function getSchedules(prisma) {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (row && Array.isArray(row.value)) return row.value;
  const old = await prisma.appSetting.findUnique({ where: { key: OLD_KEY } });
  if (old && Array.isArray(old.value) && old.value.length) {
    return [{ key: 'S1', name: 'Whole school', classIds: [], periods: withKeys(old.value), dayCounts: {} }];
  }
  return [];
}

/** The schedule a class follows: the list that names it, else the main (first) list. */
function scheduleFor(schedules, classId) {
  return schedules.find((s, i) => i > 0 && (s.classIds || []).includes(classId)) || schedules[0] || null;
}

/**
 * A class's periods, optionally for one weekday (later teaching periods dropped when the day is shorter;
 * breaks after the last remaining teaching period dropped too).
 */
function periodsOf(schedule, weekday = null) {
  if (!schedule) return [];
  const all = schedule.periods || [];
  const n = weekday === null || weekday === undefined ? null : schedule.dayCounts?.[String(weekday)];
  if (!n) return all;
  const out = [];
  let teaching = 0;
  for (const p of all) {
    if (!p.isBreak) { if (teaching >= n) break; teaching += 1; }
    out.push(p);
  }
  while (out.length && out[out.length - 1].isBreak) out.pop();
  return out;
}

async function periodsForClass(prisma, classId, weekday = null) {
  return periodsOf(scheduleFor(await getSchedules(prisma), classId), weekday);
}

/** Teaching period keys P1…Pmax across all schedules, for views that show many classes. */
function allTeachingColumns(schedules) {
  const max = Math.max(0, ...schedules.map((s) => (s.periods || []).filter((p) => !p.isBreak).length));
  return Array.from({ length: max }, (_, i) => ({ key: `P${i + 1}`, label: `Period ${i + 1}`, isBreak: false }));
}

/** Label of a period key for a class ("Period 3", or the name the admin gave it). */
function labelFor(schedules, classId, key) {
  const p = (scheduleFor(schedules, classId)?.periods || []).find((x) => x.key === key);
  return p?.label || key.replace(/^P(\d+)$/, 'Period $1');
}

/**
 * Check and tidy the schedules the admin sends. Returns { schedules } or { error }.
 */
function parseSchedules(input) {
  if (!Array.isArray(input) || !input.length) return { error: 'Add at least one list of periods.' };
  if (input.length > 10) return { error: 'Up to 10 period lists.' };
  const time = (t) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '')) ? t : null);
  const seenClass = new Set();
  const out = [];
  for (const [i, s] of input.entries()) {
    const name = String(s?.name || '').trim().slice(0, 40) || (i === 0 ? 'Whole school' : `Period list ${i + 1}`);
    const raw = Array.isArray(s?.periods) ? s.periods : [];
    const periods = [];
    for (const p of raw) {
      const label = String(p?.label || '').trim().slice(0, 30);
      if (!label) return { error: `${name}: every period needs a name, e.g. Period 1 or Lunch.` };
      periods.push({ label, start: time(p.start), end: time(p.end), isBreak: !!p.isBreak });
    }
    const teaching = periods.filter((p) => !p.isBreak).length;
    if (!teaching) return { error: `${name}: add at least one period that isn't a break.` };
    if (teaching > 14) return { error: `${name}: up to 14 periods a day.` };
    const classIds = i === 0 ? [] : [...new Set((s.classIds || []).map(Number).filter(Number.isInteger))];
    if (i > 0 && !classIds.length) return { error: `${name}: choose the classes that follow this list.` };
    for (const id of classIds) {
      if (seenClass.has(id)) return { error: 'A class can be in only one period list.' };
      seenClass.add(id);
    }
    const dayCounts = {};
    for (const [d, n] of Object.entries(s.dayCounts || {})) {
      const day = Number(d), count = Number(n);
      if (day >= 0 && day <= 6 && Number.isInteger(count) && count > 0 && count < teaching) dayCounts[String(day)] = count;
    }
    out.push({ key: `S${i + 1}`, name, classIds, periods: withKeys(periods), dayCounts });
  }
  return { schedules: out };
}

module.exports = { KEY, getSchedules, scheduleFor, periodsOf, periodsForClass, allTeachingColumns, labelFor, parseSchedules, withKeys };
