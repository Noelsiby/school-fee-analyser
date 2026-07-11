import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import './admin.css';

const EMPTY_FORM = { name: '' };

export default function ClassesPage() {
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [modal, setModal]       = useState(null); // 'create' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving]     = useState(false);

  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiCall('/api/admin/classes');
      setClasses(data.classes);
    } catch (e) {
      setError(e.message || 'Failed to load classes.');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_FORM); setFormError(''); setModal('create'); };
  const openEdit   = (cls) => { setSelected(cls); setForm({ name: cls.name }); setFormError(''); setModal('edit'); };
  const openDelete = (cls) => { setSelected(cls); setModal('delete'); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Class name is required.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const isEdit = modal === 'edit';
      const data = await apiCall(
        isEdit ? `/api/admin/classes/${selected.id}` : '/api/admin/classes',
        { method: isEdit ? 'PUT' : 'POST', body: { name: form.name.trim() } }
      );
      setModal(null);
      if (!isEdit) {
        navigate(`/admin/classes/${data.class.id}`);
      } else {
        load();
      }
    } catch (e) {
      setFormError(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await apiCall(`/api/admin/classes/${selected.id}`, { method: 'DELETE' });
    } catch (_) { /* ignore */ }
    setSaving(false);
    setModal(null);
    load();
  };

  const filtered = classes.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Classes</h1>
          <p className="page-sub">Manage your school's classes and their setup</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Class</button>
      </div>

      {/* Search */}
      <div className="filter-bar">
        <input
          className="filter-input"
          placeholder="Search classes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="empty-state"><div className="spinner spinner-dark" /></div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: '#dc2626' }}>⚠ {error}</p>
          <button className="btn btn-ghost" onClick={load}>Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-icon">🏛️</p>
          <p className="empty-state-text">
            {search ? 'No classes match your search.' : 'No classes yet. Create your first class!'}
          </p>
          {!search && <button className="btn btn-primary" onClick={openCreate}>Create Class</button>}
        </div>
      ) : (
        <div className="classes-grid">
          {filtered.map(cls => (
            <div key={cls.id} className="class-card">
              <div className="class-card-header">
                <div className="class-icon">🏛️</div>
                <div className="table-actions">
                  <button className="btn btn-ghost btn-icon" onClick={() => openEdit(cls)}>✏️</button>
                  <button className="btn btn-danger btn-icon" onClick={() => openDelete(cls)}>🗑️</button>
                </div>
              </div>

              <h3 className="class-card-name">{cls.name}</h3>

              <div className="class-card-meta">
                <span>👩‍🏫 {cls.classTeacher?.name || <em>No Class Teacher</em>}</span>
              </div>

              <div className="class-card-stats">
                <div className="stat-item">
                  <span className="stat-number">{cls._count?.students ?? 0}</span>
                  <span className="stat-label">Students</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">{cls._count?.subjects ?? 0}</span>
                  <span className="stat-label">Subjects</span>
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => navigate(`/admin/classes/${cls.id}`)}
              >
                Open Class Hub →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{modal === 'create' ? 'Create New Class' : 'Edit Class'}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
              <div className="form-group">
                <label className="form-label">Class Name <span className="required">*</span></label>
                <input
                  className="form-input"
                  placeholder="e.g. Class 10-A, LKG, UKG"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              {modal === 'create' && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                  ✨ After creating, you'll be taken to the class setup page.
                </p>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : modal === 'create' ? 'Create & Setup →' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Class</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="confirm-body">
              <p className="confirm-icon">⚠️</p>
              <p className="confirm-msg">Delete <strong>{selected?.name}</strong>?</p>
              <p className="confirm-sub">This will also delete all students, subjects, and assignments in this class.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={handleDelete}>
                {saving ? <span className="spinner" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
