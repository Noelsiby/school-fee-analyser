// How a WhatsApp result message's status is shown in the app.
const LABELS = {
  queued:    { text: 'Sending…',   tone: 'gray',  icon: '⏳' },
  sent:      { text: 'Sent',       tone: 'blue',  icon: '✓' },
  delivered: { text: 'Delivered',  tone: 'green', icon: '✓✓' },
  read:      { text: 'Read',       tone: 'green', icon: '👁' },
  failed:    { text: 'Failed',     tone: 'red',   icon: '⚠' },
};

export const waLabel = (status) => LABELS[status] || null;

/** Still in progress → keep polling. */
export const waPending = (status) => status === 'queued';

/** "9876543210" → "98765 43210" */
export const formatPhone = (p) => (p && p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p || '');
