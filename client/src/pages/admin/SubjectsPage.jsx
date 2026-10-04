import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import { ClassPicker, PartsPicker, byClassName } from '../../components/SubjectFields';
import { PARTS, partsLabel } from '../../utils/subjectParts';
import './admin.css';

const EMPTY_FORM = { name: '', components: [], classIds: [] };

const isUsed = (s) => (s._count?.examConfigs ?? 0) + (s._count?.marks ?? 0) > 0;

/**
 * Group per-class subject rows into one school-wide subject each.
 * "English" in 12 classes = one row here. Names match ignoring case, spaces and dots,
 * so "Hindi"/"HINDI" and "P S"/"P. S"/"P.S" show together (saving renames them all to one spelling).
 */
const subjectKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

function groupSubjects(subjects) {
  const groups = new Map();
  for (const s of subjects) {
    const key = subjectKey(s.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.values()].map(rows => {
    const spellings = {};
    rows.forEach(r => { spellings[r.name] = (spellings[r.name] || 0) + 1; });
    const name = Object.entries(spellings).sort((a, b) => b[1] - a[1])[0][0];
    // Parts used in any class; when classes disagree, Edit starts from all of them ticked.
    const components = PARTS.filter(p => rows.some(r => (r.components || []).includes(p)));
    const missingParts = rows
      .filter(r => (r.components || []).length < components.length)
      .map(r => r.class)
      .sort(byClassName);
    return {
      name,
      rows,
      classes: rows.map(r => r.class).sort(byClassName),
      components,
      missingParts,
      mixedParts: missingParts.length > 0,
      mixedSpelling: Object.keys(spellings).length > 1,
      teachers: rows.reduce((n, r) => n + (r._count?.teacherAssignments ?? 0), 0),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export default function SubjectsPage() {
  const { apiCall } = useApi();
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [notice, setNotice]     = useState('');

  const [modal, setModal]       = useState(null); // 'add' | 'edit' | 'delete'
  const [group, setGroup]       = useState(null); // the subject being edited / deleted
  const [form, setForm]         = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, c] = await Promise.all([apiCall('/api/admin/subjects'), apiCall('/api/admin/classes')]);
      setSubjects(s.subjects);
      setClasses(c.classes);
    } catch (e) {
      setError(e.message || 'Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => groupSubjects(subjects), [subjects]);
  const visible = groups.filter(g => g.name.toLowerCase().includes(search.trim().toLowerCase()));

  const showNotice = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 6000); };
  const close = () => setModal(null);

  const openAdd = () => {
    setForm(EMPTY_FORM); setFormError(''); setGroup(null); setModal('add');
  };
  const openEdit = (g) => {
    setGroup(g);
    setForm({ name: g.name, components: g.components, classIds: g.classes.map(c => c.id) });
    setFormError(''); setModal('edit');
  };
  const openDelete = (g) => { setGroup(g); setFormError(''); setModal('delete'); };

  // Classes being unticked that already have exams or marks for this subject can't lose it.
  const blockedRemovals = modal === 'edit' && group
    ? group.rows.filter(r => !form.classIds.includes(r.classId) && isUsed(r)).map(r => r.class.name)
    : [];

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim())        { setFormError('Subject name is required.'); return; }
    if (form.classIds.length === 0) { setFormError('Tick at least one class.'); return; }
    setSaving(true); setFormError('');
    try {
      if (modal === 'add') {
        const res = await apiCall('/api/admin/subjects', {
          method: 'POST',
          body: { name: form.name.trim(), components: form.components, classIds: form.classIds },
        });
        const made = res.created?.length ?? 1;
        const skipped = res.skipped?.length ? ` Already existed in: ${res.skipped.join(', ')}.` : '';
        showNotice(`✅ "${form.name.trim()}" added to ${made} class${made === 1 ? '' : 'es'}.${skipped}`);
      } else {
        const res = await apiCall('/api/admin/subjects/group', {
          method: 'PUT',
          body: {
            subjectIds: group.rows.map(r => r.id),
            name: form.name.trim(),
            components: form.components,
            classIds: form.classIds,
          },
        });
        showNotice(`✅ ${res.message}`);
      }
      close(); load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true); setFormError('');
    try {
      for (const r of group.rows) {
        await apiCall(`/api/admin/subjects/${r.id}`, { method: 'DELETE' });
      }
      showNotice(`✅ "${group.name}" deleted from all classes.`);
      close(); load();
    } catch (err) {
      setFormError(err.message);
      load();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="admin-page"><div className="empty-state"><div className="spinner spinner-dark" /></div></div>;

  const groupUsed = group ? group.rows.some(isUsed) : false;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Subjects</h1>
          <p className="page-sub">
            Add each subject once and tick the classes that have it. {groups.length} subjects across {classes.length} classes.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Subject</button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}

      <div className="data-card" style={{ padding: 20 }}>
        <input
          className="filter-input" style={{ maxWidth: 300, marginBottom: 14 }}
          placeholder="Search subjects…"
          value={search} onChange={e => setSearch(e.target.value)}
        />

        {visible.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <p className="empty-state-icon">📚</p>
            <p className="empty-state-text">
              {search ? 'No subjects match.' : 'No subjects yet. Click “+ Add Subject” to add English, Maths, Telugu…'}
            </p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Extra parts</th>
                  <th>Classes</th>
                  <th style={{ width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(g => (
                  <tr key={g.name}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{g.name}</div>
                      {g.mixedSpelling && (
                        <div style={{ fontSize: '0.72rem', color: '#b45309' }} title={[...new Set(g.rows.map(r => r.name))].join(', ')}>
                          Spelled differently in some classes — Edit &amp; Save to make them match
                        </div>
                      )}
                    </td>
                    <td>
                      {g.components.length
                        ? <span className="badge badge-purple">{partsLabel(g.components)}</span>
                        : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>}
                      {g.mixedParts && (
                        <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: 4 }}>
                          Missing in {g.missingParts.map(c => c.name).join(', ')} — Edit &amp; Save to match
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {g.classes.map(c => <span key={c.id} className="badge badge-blue">{c.name}</span>)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>
                        {g.classes.length} class{g.classes.length === 1 ? '' : 'es'} · {g.teachers} teacher assignment{g.teachers === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)} aria-label={`Edit ${g.name}`}>✏️ Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => openDelete(g)} aria-label={`Delete ${g.name}`}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <h2 className="modal-title">{modal === 'add' ? 'Add Subject' : `Edit ${group.name}`}</h2>
              <button className="modal-close" onClick={close}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}

              <div className="form-group">
                <label className="form-label">Subject Name <span className="required">*</span></label>
                <input className="form-input" value={form.name} placeholder="e.g. English, Maths, Telugu"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>

              <PartsPicker
                subjectName={form.name}
                value={form.components}
                onChange={components => setForm(f => ({ ...f, components }))}
              />

              <div className="form-group">
                <label className="form-label">Classes that have this subject</label>
                <ClassPicker
                  classes={classes}
                  selected={form.classIds}
                  onChange={ids => setForm(f => ({ ...f, classIds: ids }))}
                />
              </div>

              {blockedRemovals.length > 0 && (
                <div className="alert alert-error" style={{ marginBottom: 12 }}>
                  ⚠ Can’t remove {form.name || 'this subject'} from {blockedRemovals.join(', ')} — it already has exams or marks there. Tick {blockedRemovals.length === 1 ? 'it' : 'them'} again to save.
                </div>
              )}
              {modal === 'edit' && group.mixedParts && (
                <div className="alert alert-info" style={{ marginBottom: 12 }}>
                  ℹ️ {group.missingParts.map(c => c.name).join(', ')} {group.missingParts.length === 1 ? 'doesn’t' : 'don’t'} have all these parts yet. Saving gives every ticked class the same parts.
                </div>
              )}
              {modal === 'edit' && (
                <p className="form-hint">Exams already set up keep their current max marks. New exams use these parts.</p>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || blockedRemovals.length > 0 || form.classIds.length === 0}>
                  {saving ? <span className="spinner" /> : modal === 'add'
                    ? `Add to ${form.classIds.length} class${form.classIds.length === 1 ? '' : 'es'}`
                    : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'delete' && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Subject</h2>
              <button className="modal-close" onClick={close}>✕</button>
            </div>
            {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
            <div className="confirm-body">
              <p className="confirm-icon">⚠️</p>
              {groupUsed ? (
                <p className="confirm-msg">
                  <strong>{group.name}</strong> already has exams or marks, so it can’t be deleted.
                  To take it out of some classes, use <strong>Edit</strong> and untick them.
                </p>
              ) : (
                <p className="confirm-msg">
                  Delete <strong>{group.name}</strong> from all {group.classes.length} classes?
                  Its teacher assignments will be removed too.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={close}>{groupUsed ? 'Close' : 'Cancel'}</button>
              {!groupUsed && (
                <button className="btn btn-danger" disabled={saving} onClick={handleDelete}>
                  {saving ? <span className="spinner" /> : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
