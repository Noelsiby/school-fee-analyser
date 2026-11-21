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
  const [teachers, setTeachers] = useState([]);
  const [assigning, setAssigning] = useState(null); // subject row id being saved

  const [modal, setModal]       = useState(null); // 'add' | 'edit' | 'delete'
  const [group, setGroup]       = useState(null); // the subject being edited / deleted
  const [form, setForm]         = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, c, t] = await Promise.all([apiCall('/api/admin/subjects'), apiCall('/api/admin/classes'), apiCall('/api/admin/teachers').catch(() => ({ teachers: [] }))]);
      setSubjects(s.subjects);
      setTeachers(t.teachers);
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
        const partsAdded = form.components.some(p => !group.components.includes(p) || group.mixedParts);
        showNotice(`✅ ${res.message}` + (partsAdded
          ? ' For exams that are already set up, add the part max marks in Exams → ✏️ Edit → Max Marks.'
          : ''));
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

  // Give a subject in one class to a teacher (or take it away) right from this page
  const assign = async (row, teacherId) => {
    if (!teacherId) return;
    setAssigning(row.id);
    try {
      await apiCall('/api/admin/teacher-assignments', { method: 'POST', body: { teacherId: Number(teacherId), subjectId: row.id, classId: row.classId } });
      const t = teachers.find((x) => x.id === Number(teacherId));
      showNotice(`✅ ${t?.name || 'Teacher'} now teaches ${row.class.name} ${row.name}.`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setAssigning(null); }
  };
  const unassign = async (row, a) => {
    if (!window.confirm(`Stop ${a.teacher.name} teaching ${row.class.name} ${row.name}?`)) return;
    setAssigning(row.id);
    try { await apiCall(`/api/admin/teacher-assignments/${a.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { setError(e.message); }
    finally { setAssigning(null); }
  };

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
          <div className="sj-grid">
            {/* One card per subject: its classes and who teaches each */}
            {visible.map(g => {
              const missing = g.rows.filter(r => !(r.teacherAssignments || []).length).length;
              return (
                <div key={g.name} className={`sj-card${missing ? ' sj-card-warn' : ''}`}>
                  <div className="sj-head">
                    <div>
                      <h3>{g.name}</h3>
                      {g.components.length > 0 && <span className="badge badge-purple">{partsLabel(g.components)}</span>}
                    </div>
                    <div className="sj-head-actions">
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(g)} aria-label={`Edit ${g.name}`}>✏️ Edit</button>
                      <button className="btn btn-ghost btn-xs sj-del" onClick={() => openDelete(g)} aria-label={`Delete ${g.name}`} title="Delete subject">🗑</button>
                    </div>
                  </div>
                  {(g.mixedSpelling || g.mixedParts) && (
                    <p className="sj-note">
                      {g.mixedSpelling && 'Spelled differently in some classes. '}
                      {g.mixedParts && `Parts missing in ${g.missingParts.map(c => c.name).join(', ')}. `}
                      Click Edit, then Save, to make them match.
                    </p>
                  )}
                  <p className="sj-sub">{g.rows.length} class{g.rows.length === 1 ? '' : 'es'}{missing ? <strong> · ⚠ {missing} without a teacher</strong> : ' · every class has a teacher'}</p>
                  <div className="sj-rows">
                    {[...g.rows].sort((a, b) => byClassName(a.class, b.class)).map(r => (
                      <div key={r.id} className="sj-row">
                        <span className="sj-class-name">{r.class.name}</span>
                        <span className="sj-who">
                          {(r.teacherAssignments || []).map(a => (
                            <span key={a.id} className="sj-teacher">
                              {a.teacher.name}
                              <button onClick={() => unassign(r, a)} disabled={assigning === r.id} aria-label={`Remove ${a.teacher.name}`} title="Remove this teacher">✕</button>
                            </span>
                          ))}
                          {!(r.teacherAssignments || []).length && (
                            <select className="form-select sj-assign" value="" disabled={assigning === r.id}
                              onChange={e => assign(r, e.target.value)} aria-label={`Teacher for ${r.class.name} ${r.name}`}>
                              <option value="">+ Assign teacher…</option>
                              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
