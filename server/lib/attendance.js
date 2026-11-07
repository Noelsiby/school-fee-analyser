/**
 * attendance.js — attendance settings and counting.
 *
 * The admin chooses how the school takes attendance (Settings → Attendance):
 *   daily    once a day                      slot "DAY"
 *   sessions morning + afternoon            slots "FN", "AN" (each half a day)
 *   periods  every period                   slots = that class's periods on that day (Timetable → Periods)
 * Nothing here assumes school timings.
 *
 * Status per slot: P present, T late (counts as present), A absent, L leave (parent informed; not present).
 */

const periods = require('./periods');

const ATTENDANCE_KEY = 'attendance';

const DEFAULT_SETTINGS = {
  mode: 'daily',
  weeklyOff: [0],        // 0 = Sunday … 6 = Saturday
  periodRule: 'half',    // periods mode: present for the day if present in at least half the periods taken
};

const STATUSES = ['P', 'T', 'A', 'L'];
const PRESENT = new Set(['P', 'T']);

async function getSetting(prisma, key, fallback) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

async function getSettings(prisma) {
  return { ...DEFAULT_SETTINGS, ...(await getSetting(prisma, ATTENDANCE_KEY, {})) };
}

/**
 * Slots attendance is taken in: [{ key, label }].
 * In every-period mode these are the class's own periods on that weekday (none if not set).
 */
async function slotsFor(prisma, mode, classId = null, weekday = null) {
  if (mode === 'sessions') return [{ key: 'FN', label: 'Morning (FN)' }, { key: 'AN', label: 'Afternoon (AN)' }];
  if (mode === 'periods') {
    if (!classId) return [];
    return (await periods.periodsForClass(prisma, classId, weekday)).filter((p) => !p.isBreak).map((p) => ({ key: p.key, label: p.label }));
  }
  return [{ key: 'DAY', label: 'Today' }];
}

// ── Dates ── attendance dates are calendar days in India, stored as UTC midnight.
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); // YYYY-MM-DD
const isDateStr = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const weekday = (s) => toDate(s).getUTCDay();
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sat, 7 Nov 2026" */
const prettyDate = (s) => { const d = toDate(s); return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** Start of the academic year (1 June) that a date falls in. */
function academicYearStart(s) {
  const d = toDate(s);
  const y = d.getUTCMonth() >= 5 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-06-01`;
}

/**
 * One student's day, from that day's records → { days, present }:
 *   daily     1 day; present 1 or 0
 *   sessions  each session taken is half a day (FN + AN = 1 day); present 0.5 per session attended
 *   periods   1 day; present 1 if in at least half the periods taken (periodRule "half"), else the fraction
 */
function dayPresence(records, mode, periodRule = 'half') {
  if (!records.length) return { days: 0, present: 0 };
  const presentCount = records.filter((r) => PRESENT.has(r.status)).length;
  if (mode === 'sessions') return { days: records.length * 0.5, present: presentCount * 0.5 };
  if (mode === 'periods') {
    const frac = presentCount / records.length;
    return { days: 1, present: periodRule === 'half' ? (frac >= 0.5 ? 1 : 0) : frac };
  }
  const day = records.find((r) => r.slot === 'DAY') || records[0];
  return { days: 1, present: PRESENT.has(day.status) ? 1 : 0 };
}

/**
 * Attendance totals per student from their records: { studentId: { days, present, percent } }.
 * "days" = days (or half days) attendance was taken for the student.
 */
function totals(records, mode, periodRule) {
  const byStudentDay = new Map();
  for (const r of records) {
    const k = `${r.studentId}|${ymd(r.date)}`;
    if (!byStudentDay.has(k)) byStudentDay.set(k, []);
    byStudentDay.get(k).push(r);
  }
  const out = {};
  for (const [k, recs] of byStudentDay) {
    const id = Number(k.split('|')[0]);
    const { days, present } = dayPresence(recs, mode, periodRule);
    out[id] ||= { days: 0, present: 0 };
    out[id].days += days;
    out[id].present += present;
  }
  for (const v of Object.values(out)) {
    v.days = Math.round(v.days * 10) / 10;
    v.present = Math.round(v.present * 10) / 10;
    v.percent = v.days ? Math.round((v.present / v.days) * 1000) / 10 : null;
  }
  return out;
}

module.exports = {
  ATTENDANCE_KEY, DEFAULT_SETTINGS, STATUSES, PRESENT,
  getSetting, getSettings, slotsFor,
  todayIST, isDateStr, toDate, ymd, weekday, prettyDate, academicYearStart,
  dayPresence, totals,
};
