import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { rupees } from './tuition';
import '../admin/admin.css';
import './Tuition.css';

/** Tuition → Tuition classes: Deepa's own batches, each with a monthly fee. */
export default function TuitionClassesPage() {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [classes, setClasses] = useState(null);
  const [edit, setEdit] = useState(null);   // { id?, name, monthlyFee }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => apiCall('/api/tuition/classes').then((d) => setClasses(d.classes)).catch((e) => setError(e.message)), [apiCall]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await apiCall(edit.id ? `/api/tuition/classes/${edit.id}` : '/api/tuition/classes', { method: edit.id ? 'PUT' : 'POST', body: { name: edit.name, monthlyFee: edit.monthlyFee } });
      setNotice(`✅ ${edit.name} saved.`); setEdit(null); load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete the tuition class "${c.name}"?`)) return;
    try { await apiCall(`/api/tuition/classes/${c.id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🏫 Tuition classes</h1>
          <p className="page-sub">Your tuition classes and their monthly fee. A student can be given a different fee on the Students page.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setError(''); setEdit({ name: '', monthlyFee: '' }); }}>+ New tuition class</button>
      </div>
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}
      {error && !edit && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {!classes ? <div className="spinner spinner-dark" /> : classes.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
          <p className="empty-state-icon">🏫</p>
          <p className="empty-state-text">No tuition classes yet. Make one, e.g. "Class 6 Evening" with its monthly fee.</p>
        </div></div>
      ) : (
        <div className="tu-grid">
          {classes.map((c) => (
            <div key={c.id} className="tu-card">
              <div className="tu-card-head">
                <h3>{c.name}</h3>
                <span className="tu-fee">{rupees(c.monthlyFee)}<small className="tu-muted"> /month</small></span>
              </div>
              <p className="tu-muted">👦 {c.students} student{c.students === 1 ? '' : 's'}</p>
              {c.teachers.length > 0 && <div className="tu-chips">{c.teachers.map((t) => <span key={t.id} className="tu-chip">👩‍🏫 {t.name}</span>)}</div>}
              <div className="tu-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tuition/students?class=${c.id}`)}>Students</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setError(''); setEdit({ id: c.id, name: c.name, monthlyFee: String(c.monthlyFee) }); }}>✏️ Edit</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm tu-del" onClick={() => remove(c)} title="Delete" aria-label={`Delete ${c.name}`}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <div className="modal-overlay" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">{edit.id ? 'Edit tuition class' : 'New tuition class'}</h2>
              <button className="modal-close" onClick={() => setEdit(null)} aria-label="Close">✕</button>
            </div>
            <form onSubmit={save}>
              {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
              <div className="form-group">
                <label className="form-label">Name <span className="required">*</span></label>
                <input className="form-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Class 6 Evening" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Monthly fee (₹)</label>
                <input className="form-input" type="number" min="0" value={edit.monthlyFee} onChange={(e) => setEdit({ ...edit, monthlyFee: e.target.value })} placeholder="e.g. 800" style={{ maxWidth: 180 }} />
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy || !edit.name.trim()}>{busy ? <span className="spinner" /> : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
