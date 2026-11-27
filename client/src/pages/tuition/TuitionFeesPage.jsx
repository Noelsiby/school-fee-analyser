import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { rupees, thisMonth, today, monthLabel, shortMonth } from './tuition';
import UpiQrModal from './UpiQrModal';
import ReceiptModal from './ReceiptModal';
import ReminderCard from './ReminderCard';
import MonthsPayDialog from './MonthsPayDialog';
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
  const [show, setShow] = useState('all');   // all | unpaid | part | paid | older
  const [cls, setCls] = useState('');        // tuition class id ('' = all)
  const [mode, setMode] = useState('');      // how they paid ('' = any)
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [paying, setPaying] = useState(null);   // row being marked paid (for a month)
  const [error, setError] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [together, setTogether] = useState(true);   // brothers & sisters shown together
  const [receipt, setReceipt] = useState(null);     // { ids, justPaid }
  const [months, setMonths] = useState(null);       // tuition student ids: pay several months

  const load = useCallback(() => apiCall(`/api/tuition/fees?month=${month}`).then(setData).catch((e) => setError(e.message)), [apiCall, month]);
  useEffect(() => { setData(null); load(); }, [load]);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const okShow = (s) => show === 'all'
      || (show === 'unpaid' && ['unpaid', 'part'].includes(s.status))
      || (show === 'part' && s.status === 'part')
      || (show === 'paid' && ['paid', 'free'].includes(s.status))
      || (show === 'older' && s.earlierUnpaid.length > 0);
    return data.students.filter((s) => (!q || s.name.toLowerCase().includes(q) || s.schoolClass.toLowerCase().includes(q))
      && okShow(s)
      && (!cls || String(s.tuitionClassId) === cls)
      && (!mode || s.payment?.mode === mode));
  }, [data, show, search, cls, mode]);
  const filtered = show !== 'all' || cls || mode || search.trim();
  const clearFilters = () => { setShow('all'); setCls(''); setMode(''); setSearch(''); };
  const tuitionClasses = useMemo(() => {
    const by = new Map();
    (data?.students || []).forEach((s) => by.set(String(s.tuitionClassId), s.tuitionClass));
    return [...by.entries()];
  }, [data]);

  const undo = async (row) => {
    if (!window.confirm(`Remove the ${monthLabel(month)} payment of ${row.name}?`)) return;
    try { await apiCall(`/api/tuition/fees/${row.payment.id}`, { method: 'DELETE' }); load(); }
    catch (e) { setError(e.message); }
  };

  // One student's line (used in classes and in family cards)
  const feeRow = (s) => (
    <div key={s.tuitionStudentId} className={`tu-fee-row${['unpaid', 'part'].includes(s.status) ? ' tu-unpaid' : ''}`}>
      <div className="tu-who">
        <strong>{s.name}</strong>
        <small>School: {s.schoolClass}</small>
        {s.earlierUnpaid.length > 0 && (
          <span className="tu-owe">⚠ Also not paid: {s.earlierUnpaid.map((m) => (
            <button key={m} className="link-btn" style={{ color: '#b45309', fontSize: '0.75rem', marginRight: 6 }}
              onClick={() => setPaying({ ...s, month: m, listMonth: month, kind: s.earlierPaid[m] ? 'add' : 'new', paidSoFar: s.earlierPaid[m] || 0 })}>
              {shortMonth(m)}{s.earlierPaid[m] ? ` (${rupees(s.fee - s.earlierPaid[m])} left)` : ''}
            </button>
          ))}<button className="link-btn" style={{ fontSize: '0.75rem', fontWeight: 700, marginLeft: 4 }} onClick={() => setMonths([s.tuitionStudentId])}>📅 Pay them together</button></span>
        )}
      </div>
      <span className="tu-fee-amt">{rupees(s.fee)}</span>
      <span>
        {s.status === 'paid' && <span className="badge badge-green">✓ Paid</span>}
        {s.status === 'part' && <span className="badge badge-amber" title={`Paid ${rupees(s.payment.amount)} of ${rupees(s.fee)}`}>Part: {rupees(s.payment.amount)} · {rupees(s.due)} left</span>}
        {s.status === 'unpaid' && <span className="badge badge-red">Not paid</span>}
        {s.status === 'free' && <span className="badge badge-gray">No fee</span>}
      </span>
      <div className="tu-fee-act">
        {s.payment ? (
          <>
            <span className="tu-muted">{new Date(s.payment.paidOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{s.payment.mode ? ` · ${s.payment.mode}` : ''}</span>
            <button className={`btn btn-ghost btn-xs${s.payment.receiptSentAt ? ' tu-sent' : ''}`} onClick={() => setReceipt({ ids: [s.payment.id] })} title={s.payment.receiptSentAt ? 'Receipt sent · open it' : 'Receipt: send or print'}>🧾{s.payment.receiptSentAt ? '✓' : ''}</button>
            {s.status === 'part' && <button className="btn btn-primary btn-xs" onClick={() => setPaying({ ...s, month, listMonth: month, kind: 'add', paidSoFar: s.payment.amount })} title="They paid the rest (or some more)">＋ {rupees(s.due)}</button>}
            <button className="btn btn-ghost btn-xs" onClick={() => setPaying({ ...s, month, listMonth: month, kind: 'edit', paidSoFar: s.payment.amount })} title="Change the amount, date or fee">✏️</button>
            <button className="btn btn-ghost btn-xs tu-del" onClick={() => undo(s)} title="Remove payment">✕</button>
          </>
        ) : s.fee > 0 && (
          <button className="btn btn-primary btn-sm" onClick={() => setPaying({ ...s, month, listMonth: month, kind: 'new', paidSoFar: 0 })}>✓ Mark paid</button>
        )}
        {s.fee > 0 && <button className="btn btn-ghost btn-xs" onClick={() => setMonths([s.tuitionStudentId])} title="Pay several months: late months, or in advance">📅</button>}
      </div>
    </div>
  );

  // Brothers and sisters: same parent number → one family (shown together, paid together)
  const families = useMemo(() => {
    if (!data || !together) return [];
    const by = new Map();
    data.students.forEach((s) => { if (s.family) { if (!by.has(s.family)) by.set(s.family, []); by.get(s.family).push(s); } });
    return [...by.values()].filter((f) => f.length > 1);
  }, [data, together]);
  const inFamily = new Set(families.flat().map((s) => s.tuitionStudentId));
  const payFamily = async (members) => {
    const due = members.filter((m) => m.status === 'unpaid' || m.status === 'part');
    if (!due.length) return;
    if (!window.confirm(`Mark ${monthLabel(month)} fully paid for ${due.map((m) => m.name).join(', ')}? (${rupees(due.reduce((n, m) => n + m.due, 0))})`)) return;
    try {
      const ids = [];
      for (const m of due) ids.push((await apiCall('/api/tuition/fees', { method: 'POST', body: { tuitionStudentId: m.tuitionStudentId, month, amount: m.fee, paidOn: today(), mode: 'Cash' } })).payment.id);
      load();
      setReceipt({ ids, justPaid: true }); // one receipt for the whole family
    } catch (e) { setError(e.message); }
  };

  const pct = data && data.totals.expected ? Math.min(100, Math.round((data.totals.collected / data.totals.expected) * 100)) : 0;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">💰 Fees</h1>
          <p className="page-sub">Monthly tuition fees: mark each payment when it comes in.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setQrOpen(true)}>📱 GPay / UPI QR</button>
          <button className="btn btn-ghost" onClick={() => navigate('/tuition/fee-report')}>📊 Fees report</button>
          <input className="form-input" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ maxWidth: 200 }} aria-label="Month" />
        </div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {!data ? <div className="spinner spinner-dark" /> : (
        <>
          <ReminderCard />
          <div className="tu-stats">
            <div className="tu-stat tu-good"><strong>{rupees(data.totals.collected)}</strong><span>Collected · {monthLabel(month)}</span></div>
            <div className="tu-stat"><strong>{rupees(data.totals.expected)}</strong><span>Total due</span></div>
            <div className="tu-stat tu-good"><strong>{data.totals.paid}</strong><span>Paid</span></div>
            <div className={`tu-stat ${data.totals.unpaid ? 'tu-warn' : 'tu-good'}`}><strong>{data.totals.unpaid}</strong><span>Not paid</span></div>
          </div>
          <div className="ex-bar" style={{ marginBottom: 16 }}><div style={{ width: `${pct}%` }} /></div>

          <div className="tu-filters">
            <div className="ex-tabs">
              {[['all', 'Everyone'], ['unpaid', 'Not paid'], ['part', 'Part paid'], ['paid', 'Paid'], ['older', 'Old dues']].map(([k, l]) => (
                <button key={k} className={`ex-tab${show === k ? ' ex-tab-on' : ''}`} onClick={() => setShow(k)}>{l}</button>
              ))}
            </div>
            <div className="tu-filter-row">
              <input className="form-input" placeholder="🔎 Name or school class…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
              <select className="form-select" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Tuition class">
                <option value="">All tuition classes</option>
                {tuitionClasses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Paid by">
                <option value="">Paid by: any</option>
                {MODES.map((m) => <option key={m} value={m}>Paid by {m}</option>)}
              </select>
              <label className="tu-muted" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} /> 👪 Brothers & sisters together
              </label>
            </div>
            <div className="tu-filter-foot">
              <span className="tu-muted">
                {filtered ? `Showing ${groups.length} of ${data.students.length}` : `${data.students.length} students`}
                {groups.some((g) => g.due > 0) && ` · ${rupees(groups.reduce((n, g) => n + g.due, 0))} still to pay for ${monthLabel(month)}`}
                {groups.some((g) => g.earlierDue > 0) && ` · ${rupees(groups.reduce((n, g) => n + g.earlierDue, 0))} from earlier months`}
              </span>
              {filtered && <button className="link-btn" onClick={clearFilters}>✕ Clear filters</button>}
              <div style={{ flex: 1 }} />
              {data.totals.unpaid > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tuition/messages?unpaid=${month}`)}>📢 Remind the {data.totals.unpaid} who haven't paid</button>
              )}
            </div>
          </div>

          {groups.length === 0 && (
            <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
              <p className="empty-state-text">{data.students.length ? 'Nobody in this list.' : 'No tuition students for this month yet.'}</p>
            </div></div>
          )}

          {/* Brothers and sisters (same parent number) together */}
          {families.map((f) => f.filter((m) => groups.includes(m))).filter((f) => f.length > 0).length > 0 && (
            <section className="tu-group">
              <h3>👪 Brothers & sisters <span>same parent number, paid together</span></h3>
              {families.map((f) => f.filter((m) => groups.includes(m))).filter((f) => f.length > 0).map((f) => {
                const all = families.find((x) => x.includes(f[0]));
                const owing = all.filter((m) => m.status === 'unpaid' || m.status === 'part');
                return (
                  <div key={f[0].family} className="data-card tu-fee-list" style={{ marginBottom: 10, borderLeft: '4px solid #ea580c' }}>
                    <div className="tu-fee-row" style={{ background: '#fff7ed' }}>
                      <strong>👪 {all.map((m) => m.name.split(' ')[0]).join(' & ')}</strong>
                      <span className="tu-fee-amt">{rupees(all.reduce((n, m) => n + m.fee, 0))}</span>
                      <span>{owing.length ? <span className="badge badge-red">{owing.length} not paid</span> : <span className="badge badge-green">✓ All paid</span>}</span>
                      <div className="tu-fee-act">
                        <button className="btn btn-ghost btn-sm" onClick={() => setMonths(all.map((m) => m.tuitionStudentId))} title="Several months, late or in advance, for all of them">📅 Pay months</button>
                        {owing.length > 0 && <button className="btn btn-primary btn-sm" onClick={() => payFamily(all)}>✓ Mark all paid ({rupees(owing.reduce((n, m) => n + m.due, 0))})</button>}
                        {all.filter((m) => m.payment).length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setReceipt({ ids: all.filter((m) => m.payment).map((m) => m.payment.id) })}>🧾 One receipt</button>}
                      </div>
                    </div>
                    {f.map(feeRow)}
                  </div>
                );
              })}
            </section>
          )}

          {(() => {
            const by = new Map();
            groups.filter((x) => !inFamily.has(x.tuitionStudentId)).forEach((x) => { if (!by.has(x.tuitionClass)) by.set(x.tuitionClass, []); by.get(x.tuitionClass).push(x); });
            return [...by.entries()];
          })().map(([cls, list]) => (
            <section key={cls} className="tu-group">
              <h3>🏫 {cls} <span>{list.filter((s) => ['paid', 'free'].includes(s.status)).length} of {list.length} paid</span></h3>
              <div className="data-card tu-fee-list">
                {list.map(feeRow)}
              </div>
            </section>
          ))}
        </>
      )}

      {qrOpen && <UpiQrModal onClose={() => setQrOpen(false)} note={`Tuition fee ${monthLabel(month)}`} />}
      {paying && <PayDialog row={paying} onClose={() => setPaying(null)} onSaved={(p, earlier) => { setPaying(null); load(); setReceipt({ ids: [p.id], earlier, justPaid: true }); }} />}
      {months && <MonthsPayDialog ids={months} onClose={() => setMonths(null)} onSaved={(ids, earlier) => { setMonths(null); load(); setReceipt({ ids, earlier, justPaid: true }); }} />}
      {receipt && <ReceiptModal paymentIds={receipt.ids} earlier={receipt.earlier} justPaid={receipt.justPaid} onClose={() => setReceipt(null)} onSent={load} />}
    </div>
  );
}

/**
 * Record a fee payment.
 *   new   nothing paid yet for that month
 *   add   they already paid part: this amount is ADDED (e.g. ₹500 earlier + ₹100 now)
 *   edit  change what was typed (amount, date, how)
 * When the total is less than the fee, Deepa says whether the rest is still to come, or this
 * student simply pays less every month (the amount becomes their own monthly fee).
 */
function PayDialog({ row, onClose, onSaved }) {
  const { apiCall } = useApi();
  const existing = row.month === row.listMonth ? row.payment : null;
  const paidSoFar = row.paidSoFar || 0;
  const firstKind = row.kind || (existing ? 'edit' : 'new');
  const startAmount = (k) => String(k === 'add' ? Math.max(0, row.fee - paidSoFar) : k === 'edit' ? (existing?.amount ?? row.fee) : row.fee);
  const [kind, setKind] = useState(firstKind);
  const [amount, setAmount] = useState(startAmount(firstKind));
  const [paidOn, setPaidOn] = useState(firstKind === 'edit' && existing?.paidOn ? String(existing.paidOn).slice(0, 10) : today());
  const [mode, setMode] = useState((firstKind === 'edit' && existing?.mode) || 'Cash');
  const [note, setNote] = useState(firstKind === 'edit' ? existing?.note || '' : '');
  const [lessFee, setLessFee] = useState(false);   // true: this student's fee becomes the total
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const n = Number(amount) || 0;
  const total = kind === 'add' ? paidSoFar + n : n;
  const short = total > 0 && total < row.fee;
  const switchKind = (k) => { setKind(k); setAmount(startAmount(k)); setLessFee(false); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const d = await apiCall('/api/tuition/fees', { method: 'POST', body: { tuitionStudentId: row.tuitionStudentId, month: row.month, amount, paidOn, mode, note, add: kind === 'add' } });
      if (short && lessFee) await apiCall(`/api/tuition/students/${row.tuitionStudentId}`, { method: 'PUT', body: { feeOverride: total } });
      onSaved(d.payment, d.earlier);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 className="modal-title">💰 {row.name} · {monthLabel(row.month)}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={save}>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
          {paidSoFar > 0 && (
            <>
              <p className="tu-muted" style={{ marginBottom: 8 }}>Paid so far: <strong>{rupees(paidSoFar)}</strong> of {rupees(row.fee)}{paidSoFar < row.fee ? ` · ${rupees(row.fee - paidSoFar)} left` : ''}</p>
              {existing && (
                <div className="ex-tabs" style={{ marginBottom: 12 }}>
                  <button type="button" className={`ex-tab${kind === 'add' ? ' ex-tab-on' : ''}`} onClick={() => switchKind('add')}>＋ They paid more</button>
                  <button type="button" className={`ex-tab${kind === 'edit' ? ' ex-tab-on' : ''}`} onClick={() => switchKind('edit')}>✏️ Correct the amount</button>
                </div>
              )}
            </>
          )}
          <div className="form-group">
            <label className="form-label">{kind === 'add' ? 'Paid now (₹)' : `Amount paid (₹) · fee ${rupees(row.fee)}`}</label>
            <input className="form-input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus style={{ maxWidth: 180, fontSize: '1.1rem', fontWeight: 700 }} />
            {kind === 'add' && n > 0 && <p className="tu-muted" style={{ marginTop: 4 }}>Total for {monthLabel(row.month)}: <strong>{rupees(total)}</strong></p>}
          </div>
          {short && (
            <div className="tu-short">
              <strong>{rupees(row.fee - total)} less than the fee. What is it?</strong>
              <label><input type="radio" name="short" checked={!lessFee} onChange={() => setLessFee(false)} /> They will pay the rest later <small>(shows {rupees(row.fee - total)} still to pay)</small></label>
              <label><input type="radio" name="short" checked={lessFee} onChange={() => setLessFee(true)} /> This student pays only {rupees(total)} every month <small>(their fee becomes {rupees(total)}; change it any time on the Students page)</small></label>
            </div>
          )}
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
            <button type="submit" className="btn btn-primary" disabled={busy || !(n > 0)}>{busy ? <span className="spinner" /> : '✓ Save payment'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
