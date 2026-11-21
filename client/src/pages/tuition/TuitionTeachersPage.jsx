import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import '../admin/admin.css';
import './Tuition.css';

const EMPTY = { name: '', phone: '', subjects: '', classIds: [] };

/** Tuition → Teachers: the tuition teachers and which tuition classes they take. */
export default function TuitionTeachersPage() {
  const { apiCall } = useApi();
  const [teachers, setTeachers] = useState(null);
  const [classes, setClasses] = useState([]);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => Promise.all([apiCall('/api/tuition/teachers'), apiCall('/api/tuition/classes')])
    .then(([t, c]) => { setTeachers(t.teachers); setClasses(c.classes); })
    .catch((e) => setError(e.message)), [apiCall]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await apiCall(edit.id ? `/api/tuition/teachers/${edit.id}` : '/api/tuition/teachers', { method: edit.id ? 'PUT' : 'POST', body: edit });
      setEdit(null); load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Remove ${t.name} from tuition teachers?`)) return;
    try { await apiCall(`/api/tuition/teachers/${t.id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(err.message); }
  };
  const toggle = (id) => setEdit((f) => ({ ...f, classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id] }));

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">👩‍🏫 Tuition teachers</h1>
          <p className="page-sub">Who teaches in tuition, their subjects and classes.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setError(''); setEdit({ ...EMPTY }); }}>+ Add teacher</button>
      </div>
      {error && !edit && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {!teachers ? <div className="spinner spinner-dark" /> : teachers.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
          <p className="empty-state-icon">👩‍🏫</p>
          <p className="empty-state-text">No tuition teachers yet.</p>
        </div></div>
      ) : (
        <div className="tu-grid">
          {teachers.map((t) => (
            <div key={t.id} className="tu-card">
              <div className="tu-card-head">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className="tu-avatar">{t.name.charAt(0)}</span>
                  <div>
                    <h3>{t.name}</h3>
                    {t.phone && <p className="tu-muted">📞 {t.phone}</p>}
                  </div>
                </div>
              </div>
              {t.subjects && <p className="tu-muted">📚 {t.subjects}</p>}
              <div className="tu-chips">
                {t.classes.length ? t.classes.map((c) => <span key={c.id} className="tu-chip">🏫 {c.name}</span>) : <span className="tu-muted">No classes yet</span>}
              </div>
              <div className="tu-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => { setError(''); setEdit({ id: t.id, name: t.name, phone: t.phone || '', subjects: t.subjects || '', classIds: t.classes.map((c) => c.id) }); }}>✏️ Edit</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost btn-sm tu-del" onClick={() => remove(t)} title="Remove" aria-label={`Remove ${t.name}`}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <div className="modal-overlay" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 className="modal-title">{edit.id ? 'Edit teacher' : 'Add teacher'}</h2>
              <button className="modal-close" onClick={() => setEdit(null)} aria-label="Close">✕</button>
            </div>
            <form onSubmit={save}>
              {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
              <div className="form-group">
                <label className="form-label">Name <span className="required">*</span></label>
                <input className="form-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
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
    </div>
  );
}
