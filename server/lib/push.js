/**
 * push.js — free notifications to the Student App (Expo push service).
 *
 * notifyFamilies() records each notification in the app's 🔔 list and pushes it to
 * every phone the family is signed in on. Only families that use the app (have a PIN)
 * are reached; the result says which phone numbers were, so callers can send WhatsApp
 * to the others instead.
 *
 * Settings (Render → Environment, optional):
 *   EXPO_ACCESS_TOKEN  if "enhanced push security" is turned on in the Expo dashboard
 *   EXPO_PUSH_URL      push service address (tests point it at a fake)
 */

const { normalizePhone } = require('./whatsapp');

const PUSH_URL = () => process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo accepts up to 100 messages per request

/** Send messages to Expo in batches; returns the push tokens Expo says are no longer valid. */
async function sendToExpo(messages) {
  const dead = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    try {
      const res = await fetch(PUSH_URL(), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json().catch(() => ({}));
      (body.data || []).forEach((ticket, k) => {
        if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[k].to);
      });
      if (!res.ok) console.error('[push] Expo returned', res.status, JSON.stringify(body).slice(0, 300));
    } catch (e) {
      console.error('[push] could not reach Expo:', e.message);
    }
  }
  return dead;
}

/**
 * Notify families that use the app.
 * items: [{ phone, studentId, type, title, body, data }]  (phone in any format)
 * Returns { reachedPhones: Set<"91XXXXXXXXXX">, notified: number }.
 */
async function notifyFamilies(prisma, items) {
  const wanted = items.map((it) => ({ ...it, phone: normalizePhone(it.phone) })).filter((it) => it.phone);
  if (!wanted.length) return { reachedPhones: new Set(), notified: 0 };
  const accounts = await prisma.parentAccount.findMany({
    where: { phone: { in: [...new Set(wanted.map((w) => w.phone))] }, pinHash: { not: null } },
    include: { pushTokens: true },
  });
  const byPhone = new Map(accounts.map((a) => [a.phone, a]));
  const messages = [];
  const reachedPhones = new Set();
  let notified = 0;
  for (const it of wanted) {
    const account = byPhone.get(it.phone);
    if (!account) continue;
    reachedPhones.add(it.phone);
    notified++;
    await prisma.parentNotification.create({
      data: { parentId: account.id, studentId: it.studentId ?? null, type: it.type, title: it.title, body: it.body, data: it.data || {} },
    });
    for (const t of account.pushTokens) {
      messages.push({
        to: t.token,
        title: it.title,
        body: it.body,
        sound: 'default',
        channelId: 'default',
        data: { ...(it.data || {}), type: it.type, studentId: it.studentId ?? null },
      });
    }
  }
  if (messages.length) {
    const dead = await sendToExpo(messages);
    if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
  }
  return { reachedPhones, notified };
}

module.exports = { notifyFamilies, sendToExpo };
