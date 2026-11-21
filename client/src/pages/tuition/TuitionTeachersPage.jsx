import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { rupees, thisMonth, today, monthLabel } from './tuition';
import '../admin/admin.css';
import '../admin/Exams.css';
import './Tuition.css';

const EMPTY = { name: '', phone: '', subjects: '', monthlySalary: '', classIds: [] };
const MODES = ['Cash', 'UPI', 'Bank', 'Other'];

/**
 * Tuition → Teachers & salaries.
 * Teachers: pick from the school's teachers, or add an outside teacher. Each has a monthly salary.
 * Salaries: each month, mark what was paid to each teacher.
 */
export default function TuitionTeachersPage() {
  const { apiCall } = useApi();
  const [teachers, setTeachers] = useState(null);
  const [classes, setClasses] = useState([]);
  const [edit, setEdit] = useState(null);          // teacher form
  const [picking, setPicking] = useState(false);   // choose from school teachers
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // salaries
  const [month, setMonth] = useState(thisMonth());
  const [sal, setSal] = useState(null);
  const [paying, setPaying] = useState(null);

  const load = useCallback(() => Promise.all([apiCall('/api/tuition/teachers'), apiCall('/api/tuition/classes')])
    .then(([t, c]) => { setTeachers(t.teachers); setClasses(c.classes); })
    .catch((e) => setError(e.message)), [apiCall]);
  const loadSal = useCallback(() => apiCall(`/api/tuition/salaries?month=${month}`).then(setSal).catch((e) => setError(e.message)), [apiCall, month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSal(); }, [loadSal]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await apiCall(edit.id ? `/api/tuition/teachers/${edit.id}` : '/api/tuition/teachers', { method: edit.id ? 'PUT' : 'POST', body: edit });
      setEdit(null); load(); loadSal();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Remove ${t.name} from tuition teachers? Their salary records are removed too.`)) return;
    try { await apiCall(`/api/tuition/teachers/${t.id}`, { method: 'DELETE' }); load(); loadSal(); }
    catch (err) { setError(err.message); }
  };
  const undoSalary = async (row) => {
    if (!window.confirm(`Remove ${row.name}'s salary for ${monthLabel(month)}?`)) return;
    try { await apiCall(`/api/tuition/salaries/${row.payment.id}`, { method: 'DELETE' }); loadSal(); }
    catch (err) { setError(err.message); }
  };
  const toggle = (id) => setEdit((f) => ({ ...f, classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id] }));

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">👩‍🏫 Teachers & salaries</h1>
          <p className="page-sub">Pick tuition teachers from the school's teachers, or add teachers from outside.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => { setError(''); setPicking(true); }}>+ From school teachers</button>
          <button className="btn btn-ghost" onClick={() => { setError(''); setEdit({ ...EMPTY }); }}>+ Outside teacher</button>
        </div>
      </div>
      {error && !edit && !picking && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {!teachers ? <div className="spinner spinner-dark" /> : teachers.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
          <p className="empty-state-icon">👩‍🏫</p>
          <p className="empty-state-text">No tuition teachers yet. Pick from the school's teachers or add an outside teacher.</p>
        </div></div>
      ) : (
        <div className="tu-grid">
          {teachers.map((t) => (
            <div key={t.id} className="tu-card">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="tu-avatar">{t.name.charAt(0)}</span>
                <div style={{ minWidth: 0 }}>
                  <h3>{t.name}</h3>
                  <span className={`badge ${t.fromSchool ? 'badge-blue' : 'badge-amber'}`}>{t.fromSchool ? 'School teacher' : 'Outside'}</span>
                </div>
              </div>
              {t.phone && <p className="tu-muted">📞 {t.phone}</p>}
              {t.subjects && <p className="tu-muted">📚 {t.subjects}</p>}
              <p className="tu-muted">💵 Salary: <strong>{rupees(t.monthlySalary)}</strong>/month</p>
              <div className="tu-chips">
                {t.classes.length ? t.classes.map((c) => <span key={c.id} className="tu-chip">🏫 {c.name}</span>) : <span className="tu-muted">No tuition classes yet</span>}
              </div>
              <div className="tu-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => { setError(''); setEdit({ id: t.id, name: t.name, phone: t.phone || '', subjects: t.subjects || '', monthlySalary: String(t.monthlySalary || ''), classIds: t.classes.map((c) => c.id), fromSchool: t.fromSchool }); }}>✏️ Edit</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm tu-del" onClick={() => remove(t)} title="Remove" aria-label={`Remove ${t.name}`}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Salaries ── */}
      <div className="tu-toolbar" style={{ marginTop: 26 }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>💵 Salaries</h2>
        <div style={{ flex: 1 }} />
        <input className="form-input" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ maxWidth: 200 }} aria-label="Month" />
      </div>
      {sal && (
        <>
          <div className="tu-stats">
            <div className="tu-stat tu-good"><strong>{rupees(sal.totals.paid)}</strong><span>Paid · {monthLabel(month)}</span></div>
            <div className="tu-stat"><strong>{rupees(sal.totals.due)}</strong><span>Total salaries</span></div>
            <div className={`tu-stat ${sal.totals.due - sal.totals.paid > 0 ? 'tu-warn' : 'tu-good'}`}><strong>{rupees(Math.max(0, sal.totals.due - sal.totals.paid))}</strong><span>Still to pay</span></div>
          </div>
          {sal.teachers.length > 0 && (
            <div className="data-card tu-fee-list">
              {sal.teachers.map((t) => (
                <div key={t.teacherId} className={`tu-fee-row${!t.payment && t.monthlySalary > 0 ? ' tu-unpaid' : ''}`}>
                  <div className="tu-who"><strong>{t.name}</strong></div>
                  <span className="tu-fee-amt">{rupees(t.monthlySalary)}</span>
                  <span>{t.payment ? <span className="badge badge-green">✓ Paid {rupees(t.payment.amount)}</span> : t.monthlySalary > 0 ? <span className="badge badge-red">Not paid</span> : <span className="badge badge-gray">No salary set</span>}</span>
                  <div className="tu-fee-act">
                    {t.payment ? (
                      <>
                        <span className="tu-muted">{new Date(t.payment.paidOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{t.payment.mode ? ` · ${t.payment.mode}` : ''}</span>
                        <button className="btn btn-ghost btn-xs" onClick={() => setPaying(t)} title="Change">✏️</button>
                        <button className="btn btn-ghost btn-xs tu-del" onClick={() => undoSalary(t)} title="Remove">✕</button>
                      </>
                    ) : <button className="btn btn-primary btn-sm" onClick={() => setPaying(t)}>✓ Mark paid</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {picking && <PickSchoolTeachers onClose={() => setPicking(false)} onPicked={(u) => { setPicking(false); setEdit({ ...EMPTY, name: u.name, schoolUserId: u.id, fromSchool: true }); }} />}

      {edit && (
        <div className="modal-overlay" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 className="modal-title">{edit.id ? 'Edit teacher' : edit.fromSchool ? 'Add school teacher to tuition' : 'Add outside teacher'}</h2>
              <button className="modal-close" onClick={() => setEdit(null)} aria-label="Close">✕</button>
            </div>
            <form onSubmit={save}>
              {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
              <div className="form-group">
                <label className="form-label">Name <span className="required">*</span></label>
                <input className="form-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus={!edit.fromSchool} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} inputMode="tel" />
              </div>
              <div className="form-group">
                <label className="form-label">Subjects</label>
                <input className="form-input" value={edit.subjects} onChange={(e) => setEdit({ ...edit, subjects: e.target.value })} placeholder="e.g. Maths, Science" />
              </div>
              <div className="form-group">
                <label className="form-label">Monthly salary (₹)</label>
                <input className="form-input" type="number" min="0" value={edit.monthlySalary} onChange={(e) => setEdit({ ...edit, monthlySalary: e.target.value })} placeholder="e.g. 5000" style={{ maxWidth: 180 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Tuition classes</label>
                {classes.length === 0 ? <p className="tu-muted">Make tuition classes first.</p> : (
                  <div className="tu-chips">
                    {classes.map((c) => (
                      <label key={c.id} className="tu-chip" style={{ cursor: 'pointer', background: edit.classIds.includes(c.id) ? '#fed7aa' : undefined }}>
                        <input type="checkbox" checked={edit.classIds.includes(c.id)} onChange={() => toggle(c.id)} style={{ marginRight: 4 }} />{c.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy || !edit.name.trim()}>{busy ? <span className="spinner" /> : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paying && <SalaryDialog row={paying} month={month} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); loadSal(); }} />}
    </div>
  );
}

function PickSchoolTeachers({ onClose, onPicked }) {
  const { apiCall } = useApi();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { apiCall('/api/tuition/school-teachers').then((d) => setList(d.teachers)).catch(() => setList([])); }, [apiCall]);
  const shown = (list || []).filter((t) => !q.trim() || t.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 className="modal-title">Pick a school teacher</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <input className="form-input" placeholder="🔎 Search a name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {!list ? <div className="spinner spinner-dark" /> : shown.length === 0 ? (
          <p className="tu-muted" style={{ marginTop: 10 }}>{list.length ? 'Nobody matches.' : 'Every school teacher is already in tuition.'}</p>
        ) : (
          <div className="tu-pick">
            {shown.map((t) => (
              <label key={t.id} onClick={() => onPicked(t)}>
                <span className="tu-avatar" style={{ width: 30, height: 30, fontSize: '0.85rem' }}>{t.name.charAt(0)}</span>{t.name}<small>{t.email}</small>
              </label>
            ))}
          </div>
        )}
        <p className="tu-muted" style={{ marginTop: 10 }}>Not in the list? Close this and use <strong>+ Outside teacher</strong>.</p>
      </div>
    </div>
  );
}

function SalaryDialog({ row, month, onClose, onSaved }) {
  const { apiCall } = useApi();
  const [amount, setAmount] = useState(String(row.payment?.amount ?? row.monthlySalary ?? ''));
  const [paidOn, setPaidOn] = useState(row.payment?.paidOn ? String(row.payment.paidOn).slice(0, 10) : today());
  const [mode, setMode] = useState(row.payment?.mode || 'Cash');
  const [note, setNote] = useState(row.payment?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await apiCall('/api/tuition/salaries', { method: 'POST', body: { teacherId: row.teacherId, month, amount, paidOn, mode, note } }); onSaved(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">💵 {row.name} · {monthLabel(month)}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={save}>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
          <div className="form-group">
            <label className="form-label">Amount paid (₹) · salary {rupees(row.monthlySalary)}</label>
            <input className="form-input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus style={{ maxWidth: 180, fontSize: '1.1rem', fontWeight: 700 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Paid on</label>
            <input className="form-input" type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} style={{ maxWidth: 200 }} />
          </div>
          <div className="form-group">
            <label className="form-label">How</label>
            <div className="ex-tabs">{MODES.map((m) => <button type="button" key={m} className={`ex-tab${mode === m ? ' ex-tab-on' : ''}`} onClick={() => setMode(m)}>{m}</button>)}</div>
          </div>
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !(Number(amount) > 0)}>{busy ? <span className="spinner" /> : '✓ Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
