/**
 * whatsapp.js — send exam results to parents through RichAutomate's API.
 *
 * Settings (Render → Environment; never in code):
 *   RICHAUTOMATE_API_KEY        required, "ra_live_…"
 *   WHATSAPP_TEMPLATE           approved template name (default "exam_result")
 *   WHATSAPP_TEMPLATE_LANGUAGE  template language code (default "en_US")
 *   RICHAUTOMATE_BASE_URL       API base (default https://richautomate.in/api/v1; tests point it at a fake)
 *
 * The approved template's variables, in order:
 *   {{1}} student name  {{2}} class  {{3}} roll no  {{4}} exam
 *   {{5}} subject marks (one line)  {{6}} total  {{7}} percentage  {{8}} grade
 */

const baseUrl = () => (process.env.RICHAUTOMATE_BASE_URL || 'https://richautomate.in/api/v1').replace(/\/$/, '');
const isConfigured = () => !!process.env.RICHAUTOMATE_API_KEY;

/** Statuses that mean the message reached WhatsApp — never resent unless asked. */
const SENT_STATUSES = ['sent', 'delivered', 'read'];

/**
 * Normalise an Indian mobile number to the provider's format: "91" + 10 digits.
 * Returns null if it doesn't look like one.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return /^91[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** WhatsApp template parameters can't contain newlines/tabs or long runs of spaces. */
const clean = (v) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || '-';

async function call(path, options = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.RICHAUTOMATE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error || body?.message || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body || {};
}

/** Send the results template. Returns the provider's message id (may be null). */
async function sendResultTemplate(phone, variables) {
  const body = await call('/send-template', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      template: process.env.WHATSAPP_TEMPLATE || 'exam_result',
      language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
      variables: variables.map(clean),
    }),
  });
  return body.message_id || body.messageId || body.id || body.data?.message_id || body.data?.id || null;
}

/** Current delivery status from the provider: queued | sent | delivered | read | failed. */
async function fetchStatus(providerMessageId) {
  const body = await call(`/message-status/${encodeURIComponent(providerMessageId)}`);
  const status = String(body.status || body.data?.status || '').toLowerCase();
  const error = body.error?.message || body.error || body.data?.error || null;
  return { status, error: error ? String(error) : null };
}

module.exports = { isConfigured, normalizePhone, sendResultTemplate, fetchStatus, SENT_STATUSES };
