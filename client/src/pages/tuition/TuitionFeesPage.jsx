import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { rupees, thisMonth, today, monthLabel, shortMonth } from './tuition';
import '../admin/admin.css';
import '../admin/Exams.css';
import './Tuition.css';

const MODES = ['Cash', 'UPI', 'Bank', 'Other'];

/**
 * Tuition → Fees: pick a month; see who has paid and who hasn't; mark payments.
 * Earlier months a student hasn't paid are shown too, so nothing is forgotten.
 */
export default function TuitionFeesPage() {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [show, setShow] = useState('all');   // all | unpaid | paid
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [paying, setPaying] = useState(null);   // row being marked paid (for a month)
  const [error, setError] = useState('');

  const load = useCallback(() => apiCall(`/api/tuition/fees?month=${month}`).then(setData).catch((e) => setError(e.message)), [apiCall, month]);
  useEffect(() => { setData(null); load(); }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const list = data.students.filter((s) => (!q || s.name.toLowerCase().includes(q))
      && (show === 'all' || (show === 'unpaid' ? ['unpaid', 'part'].includes(s.status) : ['paid', 'free'].includes(s.status))));
    const by = new Map();
    list.forEach((s) => { if (!by.has(s.tuitionClass)) by.set(s.tuitionClass, []); by.get(s.tuitionClass).push(s); });
    return [...by.entries()];
  }, [data, show, search]);

  const undo = async (row) => {
    if (!window.confirm(`Remove the ${monthLabel(month)} payment of ${row.name}?`)) return;
    try { await apiCall(`/api/tuition/fees/${row.payment.id}`, { method: 'DELETE' }); load(); }
    catch (e) { setError(e.message); }
  };

  const pct = data && data.totals.expected ? Math.min(100, Math.round((data.totals.collected / data.totals.expected) * 100)) : 0;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">💰 Fees</h1>
          <p className="page-sub">Monthly tuition fees: mark each payment when it comes in.</p>
        </div>
        <input className="form-input" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ maxWidth: 200 }} aria-label="Month" />
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {!data ? <div className="spinner spinner-dark" /> : (
        <>
          <div className="tu-stats">
            <div className="tu-stat tu-good"><strong>{rupees(data.totals.collected)}</strong><span>Collected · {monthLabel(month)}</span></div>
            <div className="tu-stat"><strong>{rupees(data.totals.expected)}</strong><span>Total due</span></div>
            <div className="tu-stat tu-good"><strong>{data.totals.paid}</strong><span>Paid</span></div>
            <div className={`tu-stat ${data.totals.unpaid ? 'tu-warn' : 'tu-good'}`}><strong>{data.totals.unpaid}</strong><span>Not paid</span></div>
          </div>
          <div className="ex-bar" style={{ marginBottom: 16 }}><div style={{ width: `${pct}%` }} /></div>

          <div className="tu-toolbar">
            <div className="ex-tabs">
              {[['all', 'Everyone'], ['unpaid', 'Not paid'], ['paid', 'Paid']].map(([k, l]) => (
                <button key={k} className={`ex-tab${show === k ? ' ex-tab-on' : ''}`} onClick={() => setShow(k)}>{l}</button>
              ))}
            </div>
            <input className="form-input" style={{ maxWidth: 240 }} placeholder="🔎 Search a name…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
            <div style={{ flex: 1 }} />
            {data.totals.unpaid > 0 && (
              <button className="btn btn-ghost" onClick={() => navigate(`/tuition/messages?unpaid=${month}`)}>📢 Remind the {data.totals.unpaid} who haven't paid</button>
            )}
          </div>

          {groups.length === 0 ? (
            <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
              <p className="empty-state-text">{data.students.length ? 'Nobody in this list.' : 'No tuition students for this month yet.'}</p>
            </div></div>
          ) : groups.map(([cls, list]) => (
            <section key={cls} className="tu-group">
              <h3>🏫 {cls} <span>{list.filter((s) => ['paid', 'free'].includes(s.status)).length} of {list.length} paid</span></h3>
              <div className="data-card tu-fee-list">
                {list.map((s) => (
                  <div key={s.tuitionStudentId} className={`tu-fee-row${['unpaid', 'part'].includes(s.status) ? ' tu-unpaid' : ''}`}>
                    <div className="tu-who">
                      <strong>{s.name}</strong>
                      <small>School: {s.schoolClass}</small>
                      {s.earlierUnpaid.length > 0 && (
                        <span className="tu-owe">⚠ Also not paid: {s.earlierUnpaid.map((m) => (
                          <button key={m} className="link-btn" style={{ color: '#b45309', fontSize: '0.75rem', marginRight: 6 }} onClick={() => setPaying({ ...s, month: m, listMonth: month })}>{shortMonth(m)}</button>
                        ))}</span>
                      )}
                    </div>
                    <span className="tu-fee-amt">{rupees(s.fee)}</span>
                    <span>
                      {s.status === 'paid' && <span className="badge badge-green">✓ Paid</span>}
                      {s.status === 'part' && <span className="badge badge-amber">Part: {rupees(s.payment.amount)}</span>}
                      {s.status === 'unpaid' && <span className="badge badge-red">Not paid</span>}
                      {s.status === 'free' && <span className="badge badge-gray">No fee</span>}
                    </span>
                    <div className="tu-fee-act">
                      {s.payment ? (
                        <>
                          <span className="tu-muted">{new Date(s.payment.paidOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{s.payment.mode ? ` · ${s.payment.mode}` : ''}</span>
                          <button className="btn btn-ghost btn-xs" onClick={() => setPaying({ ...s, month, listMonth: month })} title="Change">✏️</button>
                          <button className="btn btn-ghost btn-xs tu-del" onClick={() => undo(s)} title="Remove payment">✕</button>
                        </>
                      ) : s.fee > 0 && (
                        <button className="btn btn-primary btn-sm" onClick={() => setPaying({ ...s, month, listMonth: month })}>✓ Mark paid</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {paying && <PayDialog row={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load(); }} />}
    </div>
  );
}

function PayDialog({ row, onClose, onSaved }) {
  const { apiCall } = useApi();
  // Editing this month's payment, or recording an earlier month (empty)
  const existing = row.month === row.listMonth ? row.payment : null;
  const [amount, setAmount] = useState(String(existing?.amount ?? row.fee));
  const [paidOn, setPaidOn] = useState(existing?.paidOn ? String(existing.paidOn).slice(0, 10) : today());
  const [mode, setMode] = useState(existing?.mode || 'Cash');
  const [note, setNote] = useState(existing?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await apiCall('/api/tuition/fees', { method: 'POST', body: { tuitionStudentId: row.tuitionStudentId, month: row.month, amount, paidOn, mode, note } });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">💰 {row.name} · {monthLabel(row.month)}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={save}>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
          <div className="form-group">
            <label className="form-label">Amount paid (₹) · fee {rupees(row.fee)}</label>
            <input className="form-input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus style={{ maxWidth: 180, fontSize: '1.1rem', fontWeight: 700 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Paid on</label>
            <input className="form-input" type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} style={{ maxWidth: 200 }} />
          </div>
          <div className="form-group">
            <label className="form-label">How</label>
            <div className="ex-tabs">
              {MODES.map((m) => <button type="button" key={m} className={`ex-tab${mode === m ? ' ex-tab-on' : ''}`} onClick={() => setMode(m)}>{m}</button>)}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. receipt no. 25" />
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !(Number(amount) > 0)}>{busy ? <span className="spinner" /> : '✓ Save payment'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
