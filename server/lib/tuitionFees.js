/**
 * tuitionFees.js — tuition fee helpers shared by /api/tuition and the daily job:
 *
 *   receipts    one receipt for one or more payments of one family (same parent number);
 *               sent free on the Student App, or on WhatsApp if the family doesn't use the app
 *   reminders   on the day of the month the head of tuition picks, every family that still
 *               owes gets one message with each child's amount and months. Runs once a month.
 */
const wa = require('./whatsapp');
const { notifyFamilies } = require('./push');

const SETTINGS_KEY = 'tuition';
const SEND_GAP_MS = 400;
const LOG_MAX = 12;
const REMINDER_HOUR = 9; // not before 9 in the morning (India time)

const ist = (d = new Date(), opts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', ...opts }).format(d);
const thisMonth = () => ist(new Date(), { year: 'numeric', month: '2-digit' });
const monthOf = (d) => ist(new Date(d), { year: 'numeric', month: '2-digit' });
const todayIst = () => {
  const [y, m, d] = ist(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' }).split('-').map(Number);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return { y, m, d, hour };
};
const feeOf = (ts) => (ts.feeOverride ?? ts.class.monthlyFee);
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const shortMonth = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }); };
const dateLabel = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** "2026-08" … "2026-11": months from `from` to `to` (inclusive), at most 24. */
function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 24) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

/** What a tuition student still owes up to `upTo`: { owed, months } (part payments count). */
function owedOf(row, upTo = thisMonth(), onlyMonth = false) {
  const fee = feeOf(row);
  if (!(fee > 0)) return { owed: 0, months: [] };
  const months = onlyMonth ? (monthOf(row.joinedOn) <= upTo ? [upTo] : []) : monthsBetween(monthOf(row.joinedOn), upTo);
  let owed = 0; const owedMonths = [];
  for (const m of months) {
    const paid = row.payments.filter((p) => p.month === m).reduce((n, p) => n + p.amount, 0);
    if (fee > paid) { owed += fee - paid; owedMonths.push(m); }
  }
  return { owed, months: owedMonths };
}

// ── Settings (UPI + reminders) in app_settings key "tuition" ──
const DEFAULT_REMINDER = { enabled: false, day: 5, scope: 'all', note: '' };
async function getSettings(prisma) {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const v = row?.value || {};
  return { upiId: '', payeeName: 'Matha School Tuition', ...v, reminder: { ...DEFAULT_REMINDER, ...(v.reminder || {}) }, reminderLog: v.reminderLog || [] };
}
async function saveSettings(prisma, value) {
  await prisma.appSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value }, update: { value } });
  return value;
}
/** Date of the next automatic reminder ("2026-12-05"), or null when it's off. */
function nextReminderDate(settings) {
  const r = settings.reminder;
  if (!r.enabled) return null;
  const { y, m, d } = todayIst();
  const doneThisMonth = settings.lastAutoMonth === `${y}-${String(m).padStart(2, '0')}`;
  const [ny, nm] = doneThisMonth || d > r.day ? (m === 12 ? [y + 1, 1] : [y, m + 1]) : [y, m];
  return `${ny}-${String(nm).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
}

// ── Receipts ──
const receiptNo = (id) => `TU-${String(id).padStart(5, '0')}`;

/** Receipt for these payments (must be one family). Throws { code: 400 } when not. */
async function buildReceipt(prisma, paymentIds) {
  const ids = [...new Set((paymentIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw Object.assign(new Error('Choose the payment.'), { code: 400 });
  const pays = await prisma.tuitionPayment.findMany({
    where: { id: { in: ids } },
    include: { tuitionStudent: { include: { class: true, student: { select: { id: true, name: true, parentPhone: true, class: { select: { name: true } } } } } } },
    orderBy: [{ month: 'asc' }, { id: 'asc' }],
  });
  if (pays.length !== ids.length) throw Object.assign(new Error('Payment not found.'), { code: 404 });
  const phones = new Set(pays.map((p) => wa.normalizePhone(p.tuitionStudent.student.parentPhone) || `none-${p.tuitionStudent.studentId}`));
  if (phones.size > 1) throw Object.assign(new Error('One receipt is for one family (same parent number).'), { code: 400 });
  const settings = await getSettings(prisma);
  const items = pays.map((p) => ({
    paymentId: p.id, studentId: p.tuitionStudent.studentId, name: p.tuitionStudent.student.name,
    schoolClass: p.tuitionStudent.student.class.name, tuitionClass: p.tuitionStudent.class.name,
    month: p.month, monthLabel: monthLabel(p.month), amount: p.amount, fee: feeOf(p.tuitionStudent),
    paidOn: p.paidOn, mode: p.mode, note: p.note,
  }));
  const total = items.reduce((n, i) => n + i.amount, 0);
  const latest = pays.reduce((a, p) => (new Date(p.paidOn) > new Date(a.paidOn) ? p : a), pays[0]);
  const modes = [...new Set(items.map((i) => i.mode).filter(Boolean))].join(', ');
  const number = receiptNo(Math.min(...ids));
  const lines = [
    `🧾 Fee receipt ${number}`,
    settings.payeeName,
    `Received with thanks ${rupees(total)} on ${dateLabel(latest.paidOn)}${modes ? ` (${modes})` : ''}:`,
    ...items.map((i) => `• ${i.name} (${i.tuitionClass}), ${i.monthLabel}: ${rupees(i.amount)}${i.amount < i.fee ? ` (part of ${rupees(i.fee)})` : ''}`),
    'Thank you.',
  ];
  return {
    number, payeeName: settings.payeeName, total, paidOn: latest.paidOn, modes, items,
    phone: wa.normalizePhone(pays[0].tuitionStudent.student.parentPhone),
    sentAt: pays.every((p) => p.receiptSentAt) ? pays.reduce((a, p) => (p.receiptSentAt > a ? p.receiptSentAt : a), pays[0].receiptSentAt) : null,
    sentVia: pays.find((p) => p.receiptVia)?.receiptVia || null,
    text: lines.join('\n'),
  };
}

/** Send a receipt: Student App first (free), WhatsApp if the family isn't on the app. */
async function sendReceipt(prisma, receipt) {
  if (!receipt.phone) return { via: 'none', reason: 'This student has no parent number. Add it on the student\'s school profile.' };
  const { reachedPhones } = await notifyFamilies(prisma, [{
    phone: receipt.phone, studentId: receipt.items[0].studentId, type: 'fee',
    title: `🧾 Fee receipt ${receipt.number}`, body: receipt.text.split('\n').slice(2).join('\n'), data: {},
  }]);
  let via = reachedPhones.size ? 'app' : null;
  let reason = null;
  if (!via && wa.isConfigured()) {
    try { await wa.sendNoticeTemplate(receipt.phone, [`Fee receipt ${receipt.number}`, receipt.text.split('\n').slice(1).join(' ')]); via = 'whatsapp'; }
    catch (e) { reason = `WhatsApp could not send it: ${e.message}`; }
  }
  if (!via) return { via: 'none', reason: reason || 'This family doesn\'t use the Student App and WhatsApp sending is not set up. Use the WhatsApp or SMS button to send it from your phone.' };
  await prisma.tuitionPayment.updateMany({ where: { id: { in: receipt.items.map((i) => i.paymentId) } }, data: { receiptSentAt: new Date(), receiptVia: via } });
  return { via };
}

// ── Reminders ──
/** Every family that still owes: [{ phone, kids: [{ studentId, name, owed, months }], total }] + students without a number. */
async function reminderFamilies(prisma, scope = 'all') {
  const now = thisMonth();
  const rows = await prisma.tuitionStudent.findMany({ include: { class: true, payments: true, student: { select: { id: true, name: true, parentPhone: true } } } });
  const byPhone = new Map();
  const noPhone = [];
  for (const r of rows) {
    const { owed, months } = owedOf(r, now, scope === 'month');
    if (owed <= 0) continue;
    const kid = { studentId: r.studentId, name: r.student.name, owed, months };
    const phone = wa.normalizePhone(r.student.parentPhone);
    if (!phone) { noPhone.push(kid); continue; }
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(kid);
  }
  const families = [...byPhone].map(([phone, kids]) => ({ phone, kids, total: kids.reduce((n, k) => n + k.owed, 0) }));
  families.sort((a, b) => a.kids[0].name.localeCompare(b.kids[0].name));
  return { month: now, families, noPhone };
}

function reminderText(family, settings) {
  const kids = family.kids.map((k) => `${k.name} ${rupees(k.owed)} (${k.months.map(shortMonth).join(', ')} ${k.months[k.months.length - 1].slice(0, 4)})`).join('; ');
  return [
    `Dear parent, the tuition fee is due: ${kids}.`,
    family.kids.length > 1 ? `Total ${rupees(family.total)}.` : '',
    settings.upiId ? `You can pay by GPay / UPI to ${settings.upiId}.` : '',
    settings.reminder.note ? settings.reminder.note : '',
    'If you have already paid, please ignore this message.',
    `— ${settings.payeeName}`,
  ].filter(Boolean).join(' ');
}

/**
 * Send the reminder to every family that owes. Returns the log entry right away
 * (app notifications are done); WhatsApp messages go out in the background and the
 * entry is updated when they finish.
 */
async function sendReminders(prisma, { auto = false } = {}) {
  const settings = await getSettings(prisma);
  const { month, families, noPhone } = await reminderFamilies(prisma, settings.reminder.scope);
  const entry = { at: new Date().toISOString(), month, auto, families: families.length, app: 0, whatsapp: 0, failed: 0, waiting: 0, noPhone: noPhone.length, whatsappOff: false };
  if (families.length) {
    const { reachedPhones } = await notifyFamilies(prisma, families.map((f) => ({
      phone: f.phone, studentId: f.kids[0].studentId, type: 'fee', title: '⏰ Tuition fee reminder', body: reminderText(f, settings), data: {},
    })));
    entry.app = reachedPhones.size;
    const rest = families.filter((f) => !reachedPhones.has(f.phone));
    if (rest.length && !wa.isConfigured()) entry.whatsappOff = true;
    else entry.waiting = rest.length;
    if (rest.length && wa.isConfigured()) {
      (async () => {
        let sent = 0; let failed = 0;
        for (const f of rest) {
          try { await wa.sendNoticeTemplate(f.phone, ['Tuition fee reminder', reminderText(f, settings)]); sent++; }
          catch (e) { failed++; console.error('[tuition reminder]', f.phone.slice(-4), e.message); }
          await new Promise((r) => setTimeout(r, SEND_GAP_MS));
        }
        const s = await getSettings(prisma);
        s.reminderLog = s.reminderLog.map((x) => (x.at === entry.at ? { ...x, whatsapp: sent, failed, waiting: 0 } : x));
        await saveSettings(prisma, s);
      })().catch((e) => console.error('[tuition reminder] loop', e));
    }
  }
  const fresh = await getSettings(prisma);
  fresh.reminderLog = [entry, ...fresh.reminderLog].slice(0, LOG_MAX);
  if (auto) fresh.lastAutoMonth = month;
  await saveSettings(prisma, fresh);
  return entry;
}

/** Called every hour: sends this month's automatic reminder once, on or after the chosen day. */
async function runAutoReminder(prisma, now = todayIst()) {
  const settings = await getSettings(prisma);
  if (!settings.reminder.enabled) return null;
  const { y, m, d, hour } = now;
  const month = `${y}-${String(m).padStart(2, '0')}`;
  if (settings.lastAutoMonth === month || d < settings.reminder.day || hour < REMINDER_HOUR) return null;
  // Mark the month first, so a restart or a second run never sends it twice
  await saveSettings(prisma, { ...settings, lastAutoMonth: month });
  const entry = await sendReminders(prisma, { auto: true });
  console.log(`[tuition reminder] ${month}: ${entry.families} famil${entry.families === 1 ? 'y' : 'ies'} (app ${entry.app}, WhatsApp ${entry.waiting})`);
  return entry;
}

function startReminderJob(prisma) {
  const tick = () => runAutoReminder(prisma).catch((e) => console.error('[tuition reminder]', e));
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}

module.exports = {
  thisMonth, monthOf, monthsBetween, feeOf, owedOf, todayIst,
  getSettings, saveSettings, nextReminderDate, DEFAULT_REMINDER,
  buildReceipt, sendReceipt, receiptNo,
  reminderFamilies, reminderText, sendReminders, runAutoReminder, startReminderJob,
};
