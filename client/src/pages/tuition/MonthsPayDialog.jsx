/**
 * 📅 Pay several months at once: a late fee (October paid in November), or 2–3 months
 * brought together, even in advance. Works for one student or brothers & sisters together.
 * Every month still owed is ticked; the next months can be ticked to pay in advance.
 * Saving opens ONE receipt with every month, to send to the parent.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { rupees, today, monthLabel } from './tuition';

const MODES = ['Cash', 'UPI', 'Bank', 'Other'];
const key = (s, m) => `${s}:${m}`;

export default function MonthsPayDialog({ ids, onClose, onSaved }) {
  const { apiCall } = useApi();
  const [plan, setPlan] = useState(null);
  const [ticked, setTicked] = useState({});     // key → amount (string)
  const [paidOn, setPaidOn] = useState(today());
  const [mode, setMode] = useState('Cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const idList = ids.join(',');
  useEffect(() => {
    apiCall(`/api/tuition/fees/plan?ids=${idList}`).then((d) => {
      setPlan(d);
      const t = {};   // tick every month owed up to now
      d.students.forEach((s) => s.months.filter((m) => !m.ahead).forEach((m) => { t[key(s.tuitionStudentId, m.month)] = String(m.left); }));
      setTicked(t);
    }).catch((e) => setError(e.message));
  }, [apiCall, idList]);

  const toggle = (s, m) => setTicked((t) => {
    const n = { ...t }; const k = key(s.tuitionStudentId, m.month);
    if (k in n) delete n[k]; else n[k] = String(m.left);
    return n;
  });
  const setAmt = (k, v) => setTicked((t) => ({ ...t, [k]: v }));
  const items = useMemo(() => Object.entries(ticked).map(([k, v]) => { const [s, month] = k.split(':'); return { tuitionStudentId: Number(s), month, amount: Number(v) || 0 }; }), [ticked]);
  const total = items.reduce((n, i) => n + i.amount, 0);
  const bad = items.some((i) => !(i.amount > 0));

  const save = async () => {
    setBusy(true); setError('');
    try {
      const d = await apiCall('/api/tuition/fees/many', { method: 'POST', body: { items, paidOn, mode, note } });
      onSaved(d.payments.map((p) => p.id), d.earlier);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const many = plan && plan.students.length > 1;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 className="modal-title">📅 {plan ? (many ? `${plan.students.map((s) => s.name.split(' ')[0]).join(' & ')}: pay months` : `${plan.students[0]?.name}: pay months`) : 'Pay months'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
        {!plan ? !error && <div className="spinner spinner-dark" /> : (
          <>
            <p className="tu-muted" style={{ marginBottom: 10 }}>Tick the months the parent is paying for now. Months still owed are ticked already; tick the next months to pay in advance.</p>
            {plan.students.map((s) => (
              <div key={s.tuitionStudentId} className="tu-months">
                {many && <h4>{s.name} <small>· {s.tuitionClass} · {rupees(s.fee)}/month</small></h4>}
                {s.months.length === 0 && <p className="tu-muted">Nothing to pay. All months are paid.</p>}
                {s.months.map((m) => {
                  const k = key(s.tuitionStudentId, m.month);
                  const on = k in ticked;
                  return (
                    <div key={m.month} className={`tu-month${on ? ' tu-month-on' : ''}`}>
                      <label className="tu-month-name">
                        <input type="checkbox" checked={on} onChange={() => toggle(s, m)} />
                        <span>{monthLabel(m.month)}<small>{m.ahead ? 'in advance' : m.current ? 'this month' : 'late'}{m.paid > 0 ? ` · ${rupees(m.paid)} paid already` : ''}</small></span>
                      </label>
                      {on
                        ? <input className="form-input" type="number" min="1" value={ticked[k]} onChange={(e) => setAmt(k, e.target.value)} aria-label={`Amount for ${monthLabel(m.month)}`} />
                        : <span className="tu-muted">{rupees(m.left)}</span>}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="tu-months-total"><span>{items.length} month{items.length === 1 ? '' : 's'}</span><strong>{rupees(total)}</strong></div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Paid on</label>
                <input className="form-input" type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">How</label>
                <div className="ex-tabs">
                  {MODES.map((x) => <button type="button" key={x} className={`ex-tab${mode === x ? ' ex-tab-on' : ''}`} onClick={() => setMode(x)}>{x}</button>)}
                </div>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label className="form-label">Note (optional)</label>
              <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Oct + Nov together" />
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !items.length || bad} onClick={save}>{busy ? <span className="spinner" /> : `✓ Save ${rupees(total)} & make receipt`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
