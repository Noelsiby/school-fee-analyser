import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { partsLabel } from '../../utils/subjectParts';
import { ClassPicker, PartsPicker, byClassName } from '../../components/SubjectFields';
import ClassReportsTab from './ClassReportsTab';
import { formatPhone } from '../../utils/whatsappStatus';
import { byRoll, nextRoll } from '../../utils/rollOrder';
import './admin.css';
import './ClassDetailPage.css';

// ─────────────────────────────────────────────
// Helper: role badge
// ─────────────────────────────────────────────
function roleBadge(role) {
  if (role === 'ClassTeacher')   return <span key={role} className="badge badge-blue">CT</span>;
  if (role === 'SubjectTeacher') return <span key={role} className="badge badge-purple">ST</span>;
  return <span key={role} className="badge badge-gray">{role}</span>;
}

// ─────────────────────────────────────────────
// Tab: Students
// ─────────────────────────────────────────────
function StudentsTab({ cls, onRefresh }) {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [modal, setModal]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState({ name: '', rollNumber: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [renumber, setRenumber]   = useState(null); // preview plan for "Renumber A–Z"
  const [notice, setNotice]       = useState('');

  // Listed by roll number. Roll numbers follow alphabetical order after "Renumber A–Z";
  // a roll number the admin changes by hand moves the student to that position.
  const students = [...(cls.students || [])].sort(byRoll);
  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.rollNumber.includes(search)
  );

  const openAdd  = () => { setForm({ name: '', rollNumber: nextRoll(students) }); setFormError(''); setModal('add'); };
  const openEdit = (s) => { setSelected(s); setForm({ name: s.name, rollNumber: s.rollNumber }); setFormError(''); setModal('edit'); };
  const openDel  = (s) => { setSelected(s); setModal('delete'); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim())       { setFormError('Name is required.'); return; }
    if (!form.rollNumber.trim()) { setFormError('Roll number is required.'); return; }
    setSaving(true); setFormError('');
    try {
      const isEdit = modal === 'edit';
      await apiCall(
        isEdit ? `/api/admin/students/${selected.id}` : '/api/admin/students',
        { method: isEdit ? 'PUT' : 'POST', body: { name: form.name.trim(), rollNumber: form.rollNumber.trim(), classId: cls.id } }
      );
      setModal(null);
      onRefresh();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try { await apiCall(`/api/admin/students/${selected.id}`, { method: 'DELETE' }); } catch (_) {}
    setSaving(false); setModal(null); onRefresh();
  };

  const openRenumber = async () => {
    setSaving(true);
    try {
      const res = await apiCall(`/api/admin/classes/${cls.id}/renumber-rolls?preview=1`, { method: 'POST' });
      setRenumber(res);
    } catch (e) { setNotice(`⚠ ${e.message}`); }
    finally { setSaving(false); }
  };

  const applyRenumber = async () => {
    setSaving(true);
    try {
      const res = await apiCall(`/api/admin/classes/${cls.id}/renumber-rolls`, { method: 'POST' });
      setRenumber(null);
      setNotice(`✅ Roll numbers updated for ${res.changed} student${res.changed === 1 ? '' : 's'} — now in alphabetical order.`);
      setTimeout(() => setNotice(''), 6000);
      onRefresh();
    } catch (e) { setNotice(`⚠ ${e.message}`); }
    finally { setSaving(false); }
  };

  return (
    <div className="tab-content">
      <div className="tab-section-header">
        <div>
          <h3>Students <span className="count-badge">{students.length}</span></h3>
          <p className="tab-desc">Students of {cls.name} in roll-number order. Click a name to open their profile and progress reports.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={openRenumber} disabled={saving || students.length === 0}
            title="Give roll numbers 001, 002, … in alphabetical order of name">
            🔤 Renumber A–Z
          </button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Student</button>
        </div>
      </div>

      {notice && <div className={`alert ${notice.startsWith('⚠') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{notice}</div>}

      <input
        className="filter-input" style={{ maxWidth: 300, marginBottom: 12 }}
        placeholder="Search by name or roll…"
        value={search} onChange={e => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <p className="empty-state-icon">👦</p>
          <p className="empty-state-text">{search ? 'No students match.' : 'No students yet. Add your first student!'}</p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Roll No.</th><th>Name</th><th>Parent Cell</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td><code className="roll-number">{s.rollNumber}</code></td>
                  <td>
                    <button className="cr-link" onClick={() => navigate(`/admin/students/${s.id}`)}>{s.name}</button>
                  </td>
                  <td>{s.parentPhone ? formatPhone(s.parentPhone) : <span className="cr-muted">Not added</span>}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>✏️</button>
                      <button className="btn btn-danger btn-sm" onClick={() => openDel(s)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {renumber && (
        <div className="modal-overlay" onClick={() => setRenumber(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2 className="modal-title">Renumber {cls.name} A–Z</h2>
              <button className="modal-close" onClick={() => setRenumber(null)}>✕</button>
            </div>
            {renumber.changed === 0 ? (
              <div className="alert alert-success">✅ Roll numbers are already in alphabetical order.</div>
            ) : (
              <>
                <p style={{ fontSize: '0.88rem', marginBottom: 10 }}>
                  Roll numbers become <strong>001, 002, …</strong> in alphabetical order of name.
                  <strong> {renumber.changed}</strong> student{renumber.changed === 1 ? '' : 's'} will get a new number.
                  Marks stay with each student — only the number changes.
                </p>
                <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>New Roll</th><th>Name</th><th>Was</th></tr></thead>
                    <tbody>
                      {renumber.plan.map(p => (
                        <tr key={p.id} style={p.from !== p.to ? { background: '#fffbeb' } : undefined}>
                          <td><code className="roll-number">{p.to}</code></td>
                          <td>{p.name}</td>
                          <td className="cr-muted">{p.from !== p.to ? p.from : 'same'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRenumber(null)}>{renumber.changed ? 'Cancel' : 'Close'}</button>
              {renumber.changed > 0 && (
                <button className="btn btn-primary" disabled={saving} onClick={applyRenumber}>
                  {saving ? <span className="spinner" /> : `Renumber ${renumber.changed} student${renumber.changed === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">{modal === 'add' ? 'Add Student' : 'Edit Student'}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
              <div className="form-group">
                <label className="form-label">Student Name <span className="required">*</span></label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Roll Number <span className="required">*</span></label>
                <input className="form-input" value={form.rollNumber} onChange={e => setForm(f => ({ ...f, rollNumber: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'delete' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">Remove Student</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="confirm-body">
              <p className="confirm-icon">⚠️</p>
              <p className="confirm-msg">Remove <strong>{selected?.name}</strong> (Roll {selected?.rollNumber})?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={handleDelete}>{saving ? <span className="spinner" /> : 'Remove'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Class Teacher
// ─────────────────────────────────────────────
function ClassTeacherTab({ cls, teachers, onRefresh }) {
  const { apiCall } = useApi();
  const [selectedId, setSelectedId] = useState(cls.classTeacherId ? String(cls.classTeacherId) : '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const classTeachers = teachers.filter(t => t.roles.includes('ClassTeacher'));
  const ct = cls.classTeacher;

  const handleAssign = async () => {
    setSaving(true); setMsg('');
    try {
      await apiCall(`/api/admin/classes/${cls.id}/assign-class-teacher`, {
        method: 'PUT',
        body: { classTeacherId: selectedId ? Number(selectedId) : null },
      });
      setMsg('✅ Class teacher updated!');
      onRefresh();
    } catch (e) {
      setMsg('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab-content">
      <div className="tab-section-header">
        <div>
          <h3>Class Teacher</h3>
          <p className="tab-desc">One Class Teacher manages this class. They can also be assigned to teach subjects.</p>
        </div>
      </div>

      {ct ? (
        <div className="teacher-assigned-card">
          <div className="teacher-big-avatar">{ct.name.charAt(0)}</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, margin: '0 0 2px' }}>{ct.name}</p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 6px' }}>{ct.email}</p>
            <div className="badge-row">{ct.roles?.map(r => roleBadge(r))}</div>
          </div>
          <span className="badge badge-green" style={{ alignSelf: 'flex-start' }}>Assigned</span>
        </div>
      ) : (
        <div className="alert alert-warning">⚠ No Class Teacher assigned yet.</div>
      )}

      <div className="form-group" style={{ marginTop: 20 }}>
        <label className="form-label">Assign / Change Class Teacher</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="form-select"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ flex: 1 }}
          >
            <option value="">— Remove assignment —</option>
            {classTeachers.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={saving} onClick={handleAssign}>
            {saving ? <span className="spinner" /> : 'Assign'}
          </button>
        </div>
        {msg && <p style={{ fontSize: '0.85rem', marginTop: 6 }}>{msg}</p>}
        {classTeachers.length === 0 && (
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
            No ClassTeacher-role users found. Create teachers first on the Teachers page.
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Subjects
// ─────────────────────────────────────────────
function SubjectsTab({ cls, allClasses, onRefresh }) {
  const { apiCall } = useApi();
  const [modal, setModal]         = useState(null); // 'add' | 'edit' | 'delete' | 'copy'
  const [selected, setSelected]   = useState(null);
  const [form, setForm]           = useState({ name: '', components: [], classIds: [] });
  const [copyForm, setCopyForm]   = useState({ fromClassId: '', toClassIds: [] });
  const [formError, setFormError] = useState('');
  const [notice, setNotice]       = useState('');
  const [saving, setSaving]       = useState(false);

  const subjects = cls.subjects || [];
  const otherClasses = allClasses.filter(c => c.id !== cls.id);
  const sourceClasses = otherClasses.filter(c => (c._count?.subjects ?? 0) > 0).sort(byClassName);

  const close = () => setModal(null);
  const openAdd  = () => { setForm({ name: '', components: [], classIds: [cls.id] }); setFormError(''); setModal('add'); };
  const openEdit = (s) => { setSelected(s); setForm({ name: s.name, components: s.components || [], classIds: [cls.id] }); setFormError(''); setModal('edit'); };
  const openDel  = (s) => { setSelected(s); setFormError(''); setModal('delete'); };
  const openCopy = () => { setCopyForm({ fromClassId: sourceClasses[0]?.id ?? '', toClassIds: [cls.id] }); setFormError(''); setModal('copy'); };

  const showNotice = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 6000); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Subject name is required.'); return; }
    setSaving(true); setFormError('');
    try {
      if (modal === 'edit') {
        await apiCall(`/api/admin/subjects/${selected.id}`, {
          method: 'PUT',
          body: { name: form.name.trim(), classId: cls.id, components: form.components },
        });
      } else {
        const res = await apiCall('/api/admin/subjects', {
          method: 'POST',
          body: { name: form.name.trim(), components: form.components, classIds: form.classIds },
        });
        const made = res.created?.length ?? 1;
        const skipped = res.skipped?.length ? ` Already existed in: ${res.skipped.join(', ')}.` : '';
        showNotice(`✅ "${form.name.trim()}" added to ${made} class${made === 1 ? '' : 'es'}.${skipped}`);
      }
      close(); onRefresh();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const handleCopy = async (e) => {
    e.preventDefault();
    if (!copyForm.fromClassId) { setFormError('Choose a class to copy from.'); return; }
    setSaving(true); setFormError('');
    try {
      const res = await apiCall('/api/admin/subjects/copy', {
        method: 'POST',
        body: { fromClassId: Number(copyForm.fromClassId), toClassIds: copyForm.toClassIds },
      });
      showNotice(`✅ ${res.message}${res.skipped ? ` ${res.skipped} already existed and were skipped.` : ''}`);
      close(); onRefresh();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true); setFormError('');
    try {
      await apiCall(`/api/admin/subjects/${selected.id}`, { method: 'DELETE' });
      close(); onRefresh();
    } catch (e) {
      setFormError(e.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="tab-content">
      <div className="tab-section-header">
        <div>
          <h3>Subjects <span className="count-badge">{subjects.length}</span></h3>
          <p className="tab-desc">Subjects taught in {cls.name}. Add a subject once and tick every class that has it.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={openCopy} disabled={sourceClasses.length === 0}
            title={sourceClasses.length === 0 ? 'No other class has subjects yet' : ''}>
            ⧉ Copy from class
          </button>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Subject</button>
        </div>
      </div>

      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}

      {subjects.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <p className="empty-state-icon">📚</p>
          <p className="empty-state-text">No subjects yet. Add subjects like Mathematics, Science, English…</p>
          {sourceClasses.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={openCopy}>⧉ Copy subjects from another class</button>
          )}
        </div>
      ) : (
        <div className="subjects-list">
          {subjects.map(s => (
            <div key={s.id} className="subject-row-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>📚</span>
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                {s.components?.length > 0 && <span className="badge badge-purple" title="Extra parts marked on top of the main mark">{partsLabel(s.components)}</span>}
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  {s.teacherAssignments?.length || 0} teacher(s) assigned
                </span>
              </div>
              <div className="table-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)} aria-label={`Edit ${s.name}`}>✏️</button>
                <button className="btn btn-danger btn-sm" onClick={() => openDel(s)} aria-label={`Delete ${s.name}`}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2 className="modal-title">{modal === 'add' ? 'Add Subject' : 'Edit Subject'}</h2>
              <button className="modal-close" onClick={close}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
              <div className="form-group">
                <label className="form-label">Subject Name <span className="required">*</span></label>
                <input className="form-input" value={form.name} placeholder="e.g. Mathematics, English"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>

              <PartsPicker
                subjectName={form.name}
                value={form.components}
                onChange={components => setForm(f => ({ ...f, components }))}
              />
              {modal === 'edit' && (
                <p className="form-hint" style={{ marginTop: -8, marginBottom: 12 }}>
                  Exams already set up keep their current setting. New exams use this one.
                </p>
              )}

              {modal === 'add' && (
                <div className="form-group">
                  <label className="form-label">Add to classes</label>
                  <ClassPicker
                    classes={allClasses}
                    selected={form.classIds}
                    lockedId={cls.id}
                    onChange={ids => setForm(f => ({ ...f, classIds: ids }))}
                  />
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : modal === 'add' && form.classIds.length > 1 ? `Add to ${form.classIds.length} classes` : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'copy' && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2 className="modal-title">Copy Subjects</h2>
              <button className="modal-close" onClick={close}>✕</button>
            </div>
            <form onSubmit={handleCopy}>
              {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
              <div className="form-group">
                <label className="form-label">Copy all subjects from</label>
                <select className="form-select" value={copyForm.fromClassId}
                  onChange={e => setCopyForm(f => ({ ...f, fromClassId: e.target.value }))}>
                  {sourceClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c._count?.subjects} subjects)</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Into classes</label>
                <ClassPicker
                  classes={allClasses.filter(c => c.id !== Number(copyForm.fromClassId))}
                  selected={copyForm.toClassIds}
                  lockedId={cls.id}
                  onChange={ids => setCopyForm(f => ({ ...f, toClassIds: ids }))}
                />
                <p className="form-hint">Subjects a class already has are skipped. Extra parts (Reading / Writing / Dictation) are copied too.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || copyForm.toClassIds.length === 0}>
                  {saving ? <span className="spinner" /> : 'Copy Subjects'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'delete' && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Subject</h2>
              <button className="modal-close" onClick={close}>✕</button>
            </div>
            {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
            <div className="confirm-body">
              <p className="confirm-icon">⚠️</p>
              <p className="confirm-msg">Delete <strong>{selected?.name}</strong> from {cls.name}? Teacher assignments for this subject will also be removed.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={close}>Cancel</button>
              <button className="btn btn-danger" disabled={saving} onClick={handleDelete}>{saving ? <span className="spinner" /> : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Teacher Assignments
// ─────────────────────────────────────────────
function TeacherAssignmentsTab({ cls, teachers, onRefresh }) {
  const { apiCall } = useApi();
  const [selSubject, setSelSubject]   = useState('');
  const [selTeacher, setSelTeacher]   = useState('');
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');
  const [deleting, setDeleting]       = useState(null);

  const subjects     = cls.subjects || [];
  const assignments  = cls.teacherAssignments || [];
  const allTeachers  = teachers.filter(t =>
    t.roles.includes('ClassTeacher') || t.roles.includes('SubjectTeacher')
  );

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!selSubject) { setFormError('Please select a subject.'); return; }
    if (!selTeacher) { setFormError('Please select a teacher.'); return; }
    setSaving(true); setFormError('');
    try {
      await apiCall('/api/admin/teacher-assignments', {
        method: 'POST',
        body: { teacherId: Number(selTeacher), subjectId: Number(selSubject), classId: cls.id },
      });
      setSelSubject(''); setSelTeacher('');
      onRefresh();
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try { await apiCall(`/api/admin/teacher-assignments/${id}`, { method: 'DELETE' }); } catch (_) {}
    setDeleting(null); onRefresh();
  };

  const bySubject = subjects.map(sub => ({
    subject: sub,
    assignments: assignments.filter(a => a.subject.id === sub.id),
  }));

  return (
    <div className="tab-content">
      <div className="tab-section-header">
        <div>
          <h3>Teacher Assignments</h3>
          <p className="tab-desc">Assign any teacher (Class Teacher or Subject Teacher) to subjects.</p>
        </div>
      </div>

      <div className="assignment-form-box">
        <p style={{ fontWeight: 600, margin: '0 0 10px', fontSize: '0.9rem' }}>Assign a Teacher to a Subject</p>
        <form onSubmit={handleAdd}>
          {formError && <div className="alert alert-error" style={{ marginBottom: 8 }}>⚠ {formError}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="form-select" value={selSubject} onChange={e => setSelSubject(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
              <option value="">Select Subject…</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="form-select" value={selTeacher} onChange={e => setSelTeacher(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
              <option value="">Select Teacher…</option>
              {allTeachers.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.roles.join(' + ')})</option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Assign'}
            </button>
          </div>
        </form>
        {subjects.length === 0 && <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>⚠ Add subjects first (Subjects tab).</p>}
        {allTeachers.length === 0 && <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>⚠ No teachers found. Create teachers first.</p>}
      </div>

      {subjects.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <p className="empty-state-text">No subjects yet.</p>
        </div>
      ) : (
        <div className="subjects-list">
          {bySubject.map(({ subject, assignments: asns }) => (
            <div key={subject.id} className="subject-assignment-block">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>📚 {subject.name}</span>
                <span className="count-badge">{asns.length}</span>
              </div>
              {asns.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>No teachers assigned yet.</p>
              ) : (
                <div className="assignment-chips">
                  {asns.map(a => (
                    <div key={a.id} className="assignment-chip">
                      <span className="chip-avatar">{a.teacher.name.charAt(0)}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{a.teacher.name}</span>
                      <span style={{ display: 'flex', gap: 3 }}>{a.teacher.roles?.map(r => roleBadge(r))}</span>
                      <button
                        className="btn btn-danger btn-sm btn-icon"
                        style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                        disabled={deleting === a.id}
                        onClick={() => handleDelete(a.id)}
                      >
                        {deleting === a.id ? <span className="spinner" /> : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main: ClassDetailPage
// ─────────────────────────────────────────────
const TABS = [
  { key: 'students',      label: '👦 Students' },
  { key: 'class-teacher', label: '👩‍🏫 Class Teacher' },
  { key: 'subjects',      label: '📚 Subjects' },
  { key: 'assignments',   label: '📋 Teacher Assignments' },
  { key: 'reports',       label: '📄 Reports & WhatsApp' },
];

export default function ClassDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { apiCall } = useApi();

  const [cls, setCls]           = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [activeTab, setActiveTab] = useState('students');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [clsData, teacherData, classesData] = await Promise.all([
        apiCall(`/api/admin/classes/${id}`),
        apiCall('/api/admin/teachers'),
        apiCall('/api/admin/classes'),
      ]);
      setCls(clsData.class);
      setTeachers(teacherData.teachers);
      setAllClasses(classesData.classes);
    } catch (e) {
      setError(e.message || 'Failed to load class.');
    } finally {
      setLoading(false);
    }
  }, [apiCall, id]);

  useEffect(() => { load(); }, [load]);

  // Full-page spinner only on first load; refreshes keep the current tab (and its messages) on screen.
  if (loading && !cls) return (
    <div className="admin-page">
      <div className="empty-state"><div className="spinner spinner-dark" /></div>
    </div>
  );

  if (error && !cls) return (
    <div className="admin-page">
      <div className="empty-state">
        <p className="empty-state-icon">⚠️</p>
        <p className="empty-state-text" style={{ color: '#dc2626' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/admin/classes')}>← Back to Classes</button>
      </div>
    </div>
  );

  const stepsDone = [
    cls.students?.length > 0,
    !!cls.classTeacher,
    cls.subjects?.length > 0,
    cls.teacherAssignments?.length > 0,
  ];

  return (
    <div className="admin-page">
      {/* Breadcrumb */}
      <div className="detail-breadcrumb">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/classes')}>← Classes</button>
        <span style={{ color: '#94a3b8', margin: '0 6px' }}>/</span>
        <span style={{ fontWeight: 600 }}>{cls.name}</span>
      </div>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{cls.name}</h1>
          <p className="page-sub">
            {cls.students?.length ?? 0} students · {cls.subjects?.length ?? 0} subjects ·{' '}
            {cls.classTeacher ? `Class Teacher: ${cls.classTeacher.name}` : 'No Class Teacher'}
          </p>
        </div>
      </div>

      {/* Setup progress */}
      <div className="setup-steps">
        {['Students', 'Class Teacher', 'Subjects', 'Teacher Assignments'].map((label, i) => (
          <div key={label} className={`setup-step ${stepsDone[i] ? 'done' : ''}`}>
            {stepsDone[i] ? '✅' : '⭕'} {label}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`detail-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panel */}
      <div className="data-card" style={{ padding: 24 }}>
        {activeTab === 'students'      && <StudentsTab         cls={cls} onRefresh={load} />}
        {activeTab === 'class-teacher' && <ClassTeacherTab     cls={cls} teachers={teachers} onRefresh={load} />}
        {activeTab === 'subjects'      && <SubjectsTab         cls={cls} allClasses={allClasses} onRefresh={load} />}
        {activeTab === 'assignments'   && <TeacherAssignmentsTab cls={cls} teachers={teachers} onRefresh={load} />}
        {activeTab === 'reports'       && <ClassReportsTab cls={cls} />}
      </div>
    </div>
  );
}
