/**
 * appAdminController.js — Admin → 📱 Student App.
 * Families (one per parent number, brothers and sisters together), invites with a
 * one-time activation code (printed slip and/or WhatsApp), PIN reset, and who is
 * using the app. Codes are stored hashed, so they can only be shown when created.
 *
 * WhatsApp invite template (WHATSAPP_APP_INVITE_TEMPLATE, default "app_invite"):
 *   {{1}} children ("Arun and Divya")  {{2}} download link  {{3}} mobile number  {{4}} activation code
 */

const { PrismaClient } = require('@prisma/client');
const pa = require('../lib/parentAuth');
const wa = require('../lib/whatsapp');

const prisma = new PrismaClient();
const fail = (res, err) => { console.error('[app-admin]', err); res.status(500).json({ error: err.message }); };
const SETTING_KEY = 'studentApp';
const SEND_GAP_MS = 400;

async function appSettings() {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  return { downloadUrl: '', ...(row?.value || {}) };
}

const joinNames = (names) => (names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** Families from the students' parent numbers, with their app status. */
async function loadFamilies(classId = null) {
  const students = await prisma.student.findMany({
    select: { id: true, name: true, rollNumber: true, classId: true, parentPhone: true, class: { select: { name: true } } },
  });
  const byPhone = new Map();
  const noPhone = [];
  for (const s of students) {
    const phone = pa.normalizePhone(s.parentPhone);
    const child = { id: s.id, name: s.name, rollNumber: s.rollNumber, classId: s.classId, className: s.class.name };
    if (!phone) { if (!classId || s.classId === classId) noPhone.push({ ...child, reason: s.parentPhone ? 'Invalid number' : 'No parent number' }); continue; }
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(child);
  }
  const accounts = new Map((await prisma.parentAccount.findMany()).map((a) => [a.phone, a]));
  const now = new Date();
  const families = [...byPhone]
    .filter(([, kids]) => !classId || kids.some((k) => k.classId === classId))
    .map(([phone, kids]) => {
      const a = accounts.get(phone);
      const status = a?.pinHash ? 'active' : a?.codeHash && (!a.codeExpires || new Date(a.codeExpires) > now) ? 'invited' : a?.codeHash ? 'expired' : 'none';
      return {
        phone,
        display: pa.displayPhone(phone),
        children: kids.sort((x, y) => x.className.localeCompare(y.className, undefined, { numeric: true }) || x.name.localeCompare(y.name)),
        status,
        invitedAt: a?.invitedAt || null,
        codeExpires: a?.codeExpires || null,
        inviteStatus: a?.inviteStatus || null,
        inviteError: a?.inviteError || null,
        activatedAt: a?.activatedAt || null,
        lastLoginAt: a?.lastLoginAt || null,
      };
    })
    .sort((x, y) => x.children[0].className.localeCompare(y.children[0].className, undefined, { numeric: true }) || x.children[0].name.localeCompare(y.children[0].name));
  return { families, noPhone };
}

// ── GET /api/admin/app/families?classId= ──
exports.families = async (req, res) => {
  try {
    const classId = Number(req.query.classId) || null;
    const { families, noPhone } = await loadFamilies(classId);
    const all = classId ? (await loadFamilies(null)).families : families;
    res.json({
      settings: await appSettings(),
      waConfigured: wa.isConfigured(),
      families,
      noPhone,
      totals: {
        families: all.length,
        active: all.filter((f) => f.status === 'active').length,
        invited: all.filter((f) => f.status === 'invited').length,
        notInvited: all.filter((f) => f.status === 'none' || f.status === 'expired').length,
      },
    });
  } catch (err) { fail(res, err); }
};

// ── PUT /api/admin/app/settings  { downloadUrl } ──
exports.saveSettings = async (req, res) => {
  const downloadUrl = String(req.body?.downloadUrl || '').trim();
  if (downloadUrl && !/^https:\/\/\S+$/.test(downloadUrl)) return res.status(400).json({ error: 'The download link must start with https://' });
  try {
    const value = { ...(await appSettings()), downloadUrl };
    await prisma.appSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } });
    res.json({ settings: value });
  } catch (err) { fail(res, err); }
};

/** Give each phone a fresh code. reset = also forget the PIN and sign out everywhere. */
async function issueCodes(phones, { reset = false } = {}) {
  const out = [];
  for (const phone of phones) {
    const code = pa.newCode();
    const data = {
      codeHash: await pa.hash(code),
      codeExpires: new Date(Date.now() + pa.CODE_DAYS * 864e5),
      invitedAt: new Date(),
      inviteStatus: null,
      inviteError: null,
      failedAttempts: 0,
      lockedUntil: null,
      ...(reset ? { pinHash: null, activatedAt: null, tokenVersion: { increment: 1 } } : {}),
    };
    const account = await prisma.parentAccount.upsert({
      where: { phone },
      create: { phone, ...data, tokenVersion: 0 },
      update: data,
    });
    out.push({ account, code });
  }
  return out;
}

/** Send the WhatsApp invite to each phone in the background. */
function sendInvites(items, downloadUrl) {
  (async () => {
    for (const { account, code, children } of items) {
      await prisma.parentAccount.update({ where: { id: account.id }, data: { inviteStatus: 'queued', inviteError: null } });
      try {
        await wa.sendTemplate(account.phone, process.env.WHATSAPP_APP_INVITE_TEMPLATE || 'app_invite',
          [joinNames(children.map((c) => c.name)), downloadUrl, pa.displayPhone(account.phone), code]);
        await prisma.parentAccount.update({ where: { id: account.id }, data: { inviteStatus: 'sent' } });
      } catch (e) {
        await prisma.parentAccount.update({ where: { id: account.id }, data: { inviteStatus: 'failed', inviteError: e.message.slice(0, 300) } });
      }
      await new Promise((r) => setTimeout(r, SEND_GAP_MS));
    }
  })().catch((e) => console.error('[app-admin] invite loop', e));
}

// ── POST /api/admin/app/invites  { phones, includeActive?, sendWhatsApp? } ──
// Creates new codes (old ones stop working) and returns them for the printed slips.
exports.invite = async (req, res) => {
  const wanted = [...new Set((req.body?.phones || []).map((p) => pa.normalizePhone(p)).filter(Boolean))];
  if (!wanted.length) return res.status(400).json({ error: 'Choose the families to invite.' });
  try {
    const settings = await appSettings();
    if (req.body?.sendWhatsApp) {
      if (!wa.isConfigured()) return res.status(503).json({ error: 'WhatsApp is not set up yet.' });
      if (!settings.downloadUrl) return res.status(400).json({ error: 'Add the app download link first (top of this page).' });
    }
    const { families } = await loadFamilies(null);
    const byPhone = new Map(families.map((f) => [f.phone, f]));
    // Families already using the app are skipped unless asked (a new code would let anyone re-activate)
    const phones = wanted.filter((p) => byPhone.has(p) && (req.body?.includeActive || byPhone.get(p).status !== 'active'));
    const issued = await issueCodes(phones);
    const items = issued.map(({ account, code }) => ({ account, code, children: byPhone.get(account.phone).children }));
    if (req.body?.sendWhatsApp) sendInvites(items, settings.downloadUrl);
    res.json({
      downloadUrl: settings.downloadUrl,
      skippedActive: wanted.length - phones.length,
      invites: items.map(({ account, code, children }) => ({ phone: account.phone, display: pa.displayPhone(account.phone), code, children, codeExpires: account.codeExpires })),
    });
  } catch (err) { fail(res, err); }
};

// ── POST /api/admin/app/families/:phone/reset  { sendWhatsApp? } ── forgot PIN / lost phone
exports.reset = async (req, res) => {
  const phone = pa.normalizePhone(req.params.phone);
  if (!phone) return res.status(400).json({ error: 'Invalid number.' });
  try {
    const { families } = await loadFamilies(null);
    const fam = families.find((f) => f.phone === phone);
    if (!fam) return res.status(404).json({ error: 'No students have this parent number.' });
    const settings = await appSettings();
    const [{ account, code }] = await issueCodes([phone], { reset: true });
    if (req.body?.sendWhatsApp && wa.isConfigured() && settings.downloadUrl) sendInvites([{ account, code, children: fam.children }], settings.downloadUrl);
    res.json({ downloadUrl: settings.downloadUrl, invites: [{ phone, display: fam.display, code, children: fam.children, codeExpires: account.codeExpires }] });
  } catch (err) { fail(res, err); }
};
