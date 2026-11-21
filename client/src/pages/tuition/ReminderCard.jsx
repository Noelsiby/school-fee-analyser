/**
 * ⏰ Automatic fee reminder: on the day of the month Deepa picks, every family that still
 * owes gets one message with each child's amount and months (Student App first, WhatsApp
 * for the rest). Shown on the Fees and Fees report pages.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { rupees } from './tuition';

const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' });
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default function ReminderCard() {
  const { apiCall } = useApi();
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => apiCall('/api/tuition/reminders').then(setD).catch((e) => setError(e.message)), [apiCall]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>;
  if (!d) return null;
  const r = d.reminder;
  return (
    <>
      <div className={`tu-remind${r.enabled ? ' tu-remind-on' : ''}`}>
        <span className="tu-remind-icon">⏰</span>
        <div className="tu-who">
          <strong>Automatic fee reminder: {r.enabled ? `On · the ${ordinal(r.day)} of every month` : 'Off'}</strong>
          <small>
            {r.enabled
              ? `Next: ${dayLabel(d.next)}, in the morning, to every parent who still owes${r.scope === 'month' ? ' for that month' : ''}.`
              : 'Turn it on and parents who haven\'t paid get a message on the day you choose.'}
            {d.log[0] && ` Last sent ${when(d.log[0].at)} to ${d.log[0].families} parent${d.log[0].families === 1 ? '' : 's'}.`}
          </small>
        </div>
        <button className={`btn ${r.enabled ? 'btn-ghost' : 'btn-primary'} btn-sm`} onClick={() => setOpen(true)}>{r.enabled ? '⚙ Change' : 'Turn on'}</button>
      </div>
      {open && <ReminderDialog state={d} onClose={() => setOpen(false)} onChange={setD} />}
    </>
  );
}

function ReminderDialog({ state, onClose, onChange }) {
  const { apiCall } = useApi();
  const [enabled, setEnabled] = useState(true);
  const [day, setDay] = useState(state.reminder.day);
  const [scope, setScope] = useState(state.reminder.scope);
  const [note, setNote] = useState(state.reminder.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const p = state.preview;

  const save = async (on = enabled) => {
    setBusy(true); setError('');
    try { onChange(await apiCall('/api/tuition/reminders', { method: 'PUT', body: { enabled: on, day: Number(day), scope, note } })); onClose(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const sendNow = async () => {
    if (!window.confirm(`Send the fee reminder now to ${p.families} parent${p.families === 1 ? '' : 's'} (${rupees(p.total)} owed)?`)) return;
    setBusy(true); setError('');
    try { const d = await apiCall('/api/tuition/reminders/send', { method: 'POST' }); onChange(d); setSent(d.entry); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 className="modal-title">⏰ Automatic fee reminder</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Send it automatically every month
        </label>
        <div className="form-group">
          <label className="form-label">On which day of the month?</label>
          <select className="form-input" value={day} onChange={(e) => setDay(e.target.value)} style={{ maxWidth: 200 }} disabled={!enabled}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{ordinal(n)}</option>)}
          </select>
          <p className="tu-muted" style={{ marginTop: 4, fontSize: '0.78rem' }}>Sent once, in the morning (after 9 am). If you pick a day that has already passed this month, it starts next month. Use <em>Send now</em> for this month.</p>
        </div>
        <div className="form-group">
          <label className="form-label">Remind about</label>
          <div className="ex-tabs">
            <button type="button" className={`ex-tab${scope === 'all' ? ' ex-tab-on' : ''}`} onClick={() => setScope('all')}>Everything still owed</button>
            <button type="button" className={`ex-tab${scope === 'month' ? ' ex-tab-on' : ''}`} onClick={() => setScope('month')}>Only that month</button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Extra line (optional)</label>
          <input className="form-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pay at the tuition office, 4–6 pm." />
        </div>

        <div className="tu-receipt" style={{ marginBottom: 10 }}>
          <p className="tu-muted" style={{ marginBottom: 6 }}><strong>Right now</strong>: {p.families ? `${p.families} parent${p.families === 1 ? '' : 's'} (${p.students} student${p.students === 1 ? '' : 's'}) owe ${rupees(p.total)}.` : 'nobody owes anything 🎉'}{state.reminder.scope !== scope ? ' (with the saved choice)' : ''}</p>
          {p.sample && <p style={{ margin: 0, fontSize: '0.85rem' }}><em>Example:</em> “{p.sample}”</p>}
          {p.noPhone.length > 0 && <p className="tu-muted" style={{ marginTop: 6, fontSize: '0.78rem' }}>⚠ No parent number, so they won't get it: {p.noPhone.join(', ')}</p>}
          {!state.whatsappConfigured && <p className="tu-muted" style={{ marginTop: 6, fontSize: '0.78rem' }}>WhatsApp sending isn't set up, so only families on the Student App get it.</p>}
        </div>
        {sent && <div className="alert alert-success" style={{ marginBottom: 10 }}>✓ Sent to {sent.families} parent{sent.families === 1 ? '' : 's'}: {sent.app} on the app{sent.waiting ? `, ${sent.waiting} on WhatsApp` : ''}.</div>}

        {state.log.length > 0 && (
          <details style={{ marginBottom: 10 }}>
            <summary className="tu-muted" style={{ cursor: 'pointer' }}>Sent before ({state.log.length})</summary>
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
              {state.log.map((l) => (
                <div key={l.at} className="tu-muted" style={{ fontSize: '0.8rem' }}>
                  {when(l.at)} · {l.auto ? 'automatic' : 'sent by you'} · {l.families} parent{l.families === 1 ? '' : 's'} ({l.app} app{l.whatsapp ? `, ${l.whatsapp} WhatsApp` : ''}{l.waiting ? `, ${l.waiting} sending` : ''}{l.failed ? `, ${l.failed} failed` : ''})
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={sendNow} disabled={busy || !p.families}>📢 Send now</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => save()} disabled={busy}>{busy ? <span className="spinner" /> : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
