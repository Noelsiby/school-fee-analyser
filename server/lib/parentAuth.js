/**
 * parentAuth.js — logins for the Student App (parents).
 *
 * Parents sign in with their mobile number and a 4-digit PIN. The first time, they
 * prove the number is theirs with a one-time activation code from the school
 * (printed slip or WhatsApp). App tokens are signed with a DIFFERENT key from staff
 * tokens, so an app login can never open a staff page, and staff tokens don't work
 * in the app. Resetting a family bumps tokenVersion, signing that phone out everywhere.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { normalizePhone } = require('./whatsapp');

const MAX_TRIES = 5;                  // wrong codes / PINs before a short lock
const LOCK_MINUTES = 15;
const CODE_DAYS = 30;                 // activation codes last 30 days
const TOKEN_DAYS = 180;

const appSecret = () => `${process.env.JWT_SECRET}::student-app`;

/** "98765 43210" for showing a phone number back to the parent. */
const displayPhone = (phone) => { const d = String(phone).slice(-10); return `${d.slice(0, 5)} ${d.slice(5)}`; };

/** A 6-digit code, made with a secure random generator. */
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const isPin = (pin) => /^\d{4}$/.test(String(pin || ''));

const hash = (s) => bcrypt.hash(String(s), 10);
const matches = (s, h) => (h ? bcrypt.compare(String(s), h) : Promise.resolve(false));

function signToken(account) {
  return jwt.sign({ pid: account.id, v: account.tokenVersion, kind: 'parent' }, appSecret(), { expiresIn: `${TOKEN_DAYS}d` });
}

/** All students whose parent number is this phone (brothers and sisters together). */
async function childrenOf(prisma, phone) {
  const last10 = String(phone).slice(-10);
  const candidates = await prisma.student.findMany({
    where: { parentPhone: { contains: last10 } },
    select: { id: true, name: true, rollNumber: true, classId: true, parentPhone: true, class: { select: { name: true } }, photo: { select: { studentId: true } } },
  });
  return candidates
    .filter((s) => normalizePhone(s.parentPhone) === phone)
    .sort((a, b) => a.class.name.localeCompare(b.class.name, undefined, { numeric: true }) || a.name.localeCompare(b.name))
    .map((s) => ({ id: s.id, name: s.name, rollNumber: s.rollNumber, classId: s.classId, className: s.class.name, hasPhoto: !!s.photo }));
}

/** Middleware for app routes: a valid parent token whose version is current. */
function authenticateParent(prisma) {
  return async (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    let decoded;
    try {
      decoded = jwt.verify(token, appSecret());
    } catch {
      return res.status(401).json({ error: 'Please sign in again.' });
    }
    if (decoded.kind !== 'parent') return res.status(401).json({ error: 'Please sign in again.' });
    const account = await prisma.parentAccount.findUnique({ where: { id: decoded.pid } }).catch(() => null);
    if (!account || account.tokenVersion !== decoded.v || !account.pinHash) {
      return res.status(401).json({ error: 'Please sign in again.' });
    }
    req.parent = { id: account.id, phone: account.phone };
    next();
  };
}

/** Count a wrong attempt; lock the account for a while after too many. */
async function recordFailure(prisma, account) {
  const failed = account.failedAttempts + 1;
  await prisma.parentAccount.update({
    where: { id: account.id },
    data: failed >= MAX_TRIES
      ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) }
      : { failedAttempts: failed },
  });
  return MAX_TRIES - failed;
}

const lockedMessage = (account) => {
  const mins = Math.ceil((new Date(account.lockedUntil) - Date.now()) / 60000);
  return `Too many wrong tries. Please wait ${mins} minute${mins === 1 ? '' : 's'} and try again.`;
};
const isLocked = (account) => account.lockedUntil && new Date(account.lockedUntil) > new Date();

module.exports = {
  CODE_DAYS, displayPhone, newCode, isPin, hash, matches, signToken,
  childrenOf, authenticateParent, recordFailure, lockedMessage, isLocked, normalizePhone,
};
