import { useEffect, useState, useCallback, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import Modal from '../../components/Modal';
import './admin.css';

const ROLES = ['ClassTeacher', 'SubjectTeacher'];

function TeacherForm({ form, setForm, error, loading, onSubmit, onCancel, mode }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(form.existingPic || null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setForm(f => ({ ...f, profilePic: file }));
    setPreview(URL.createObjectURL(file));
  };

  const toggleRole = (role) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
    }));
  };

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="alert alert-error">⚠ {error}</div>}

      {/* Profile picture */}
      <div className="form-group" style={{ textAlign: 'center' }}>
        {preview
          ? <img src={preview} alt="Preview" className="file-preview" />
          : <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e2e8f0', margin: '0 auto 8px', display: 'grid', placeItems: 'center', fontSize: '1.8rem' }}>👤</div>
        }
        <div className="file-input-wrap" onClick={() => fileRef.current?.click()} style={{ marginTop: 8 }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} />
          <p className="file-input-label"><span>Click to upload</span> a profile photo (optional)</p>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Full Name <span className="required">*</span></label>
          <input className="form-input" placeholder="e.g. Anitha Rajan" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Email <span className="required">*</span></label>
          <input className="form-input" type="email" placeholder="teacher@matha.school" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Password {mode === 'edit' && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(leave blank to keep current)</span>}</label>
        <input className="form-input" type="password" placeholder={mode === 'edit' ? 'Leave blank to keep unchanged' : 'Set a secure password'}
          value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          required={mode !== 'edit'} />
      </div>

      <div className="form-group">
        <label className="form-label">Roles <span className="required">*</span></label>
        <div className="checkbox-group">
          {ROLES.map(role => (
            <label key={role} className="checkbox-item">
              <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />
              {role === 'ClassTeacher' ? '📋 Class Teacher' : '✏️ Subject Teacher'}
            </label>
          ))}
        </div>
        {form.roles.length === 0 && <p className="form-error">Select at least one role.</p>}
      </div>

      <div className="modal-footer" style={{ padding: '16px 0 0', border: 'none' }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading || form.roles.length === 0}>
          {loading ? <span className="spinner" /> : (mode === 'edit' ? 'Save Changes' : 'Add Teacher')}
        </button>
      </div>
    </form>
  );
}

function AssignmentsModal({ teacher, classes, onClose }) {
  const { apiCall } = useApi();
  const [assignments, setAssignments] = useState(teacher.subjectAssignments || []);
  const [subjects, setSubjects] = useState([]);
  const [selClass, setSelClass] = useState('');
  const [selSubject, setSelSubject] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSubjects = async (classId) => {
    setSelClass(classId); setSelSubject('');
    if (!classId) { setSubjects([]); return; }
    try {
      const res = await apiCall(`/api/admin/subjects?classId=${classId}`);
      setSubjects(res.subjects);
    } catch (e) { setErr(e.message); }
  };

  const addAssignment = async () => {
    if (!selClass || !selSubject) { setErr('Please select both a class and a subject.'); return; }
    setSaving(true); setErr('');
    try {
      const res = await apiCall('/api/admin/teacher-assignments', {
        method: 'POST',
        body: { teacherId: teacher.id, subjectId: selSubject, classId: selClass },
      });
      setAssignments(prev => [...prev, res.assignment]);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const removeAssignment = async (id) => {
    try {
      await apiCall(`/api/admin/teacher-assignments/${id}`, { method: 'DELETE' });
      setAssignments(prev => prev.filter(a => a.id !== id));
    } catch (e) { setErr(e.message); }
  };

  return (
    <>
      {err && <div className="alert alert-error">⚠ {err}</div>}
      <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>
        Assign <strong>{teacher.name}</strong> to teach specific subjects in classes.
      </p>

      {/* Current assignments */}
      {assignments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p className="form-label" style={{ marginBottom: 8 }}>Current Assignments</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {assignments.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.83rem', color: '#334155' }}>
                  <strong>{a.subject?.name}</strong> — {a.class?.name}
                </span>
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeAssignment(a.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new assignment */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
        <p className="form-label" style={{ marginBottom: 10 }}>Add Assignment</p>
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.7rem' }}>Class</label>
            <select className="form-select" value={selClass} onChange={e => loadSubjects(e.target.value)}>
              <option value="">Select class…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.7rem' }}>Subject</label>
            <select className="form-select" value={selSubject} onChange={e => setSelSubject(e.target.value)} disabled={!selClass}>
              <option value="">Select subject…</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={addAssignment} disabled={saving}>
          {saving ? <span className="spinner" /> : '+ Add'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-ghost" onClick={onClose}>Done</button>
      </div>
    </>
  );
}

export default function TeachersPage() {
  const { apiCall, apiUpload } = useApi();
  const [teachers,  setTeachers]  = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [form,      setForm]      = useState({ name: '', email: '', password: '', roles: [], profilePic: null, existingPic: null });
  const [formErr,   setFormErr]   = useState('');
  const [submitting,setSubmitting]= useState(false);
  const [notification, setNotification] = useState(null);

  const notify = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        apiCall('/api/admin/teachers'),
        apiCall('/api/admin/classes'),
      ]);
      setTeachers(tRes.teachers);
      setClasses(cRes.classes);
    } catch (e) { notify(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm({ name: '', email: '', password: '', roles: [], profilePic: null, existingPic: null }); setFormErr(''); setModal('add'); };
  const openEdit = (t) => { setSelected(t); setForm({ name: t.name, email: t.email, password: '', roles: t.roles, profilePic: null, existingPic: t.profilePicUrl }); setFormErr(''); setModal('edit'); };
  const closeModal = () => { setModal(null); setSelected(null); setFormErr(''); };

  const buildFormData = (f) => {
    const fd = new FormData();
    fd.append('name', f.name);
    fd.append('email', f.email);
    if (f.password) fd.append('password', f.password);
    fd.append('roles', JSON.stringify(f.roles));
    if (f.profilePic) fd.append('profilePic', f.profilePic);
    return fd;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { setFormErr('Name and email are required.'); return; }
    if (!form.password) { setFormErr('Password is required for new teachers.'); return; }
    if (form.roles.length === 0) { setFormErr('Select at least one role.'); return; }
    setSubmitting(true); setFormErr('');
    try {
      const res = await apiUpload('/api/admin/teachers', buildFormData(form));
      setTeachers(prev => [...prev, res.teacher].sort((a,b) => a.name.localeCompare(b.name)));
      closeModal(); notify(`Teacher "${res.teacher.name}" created.`);
    } catch (e) { setFormErr(e.message); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) { setFormErr('Name and email are required.'); return; }
    if (form.roles.length === 0) { setFormErr('Select at least one role.'); return; }
    setSubmitting(true); setFormErr('');
    try {
      const res = await apiUpload(`/api/admin/teachers/${selected.id}`, buildFormData(form), 'PUT');
      setTeachers(prev => prev.map(t => t.id === selected.id ? res.teacher : t));
      closeModal(); notify(`Teacher "${res.teacher.name}" updated.`);
    } catch (e) { setFormErr(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await apiCall(`/api/admin/teachers/${selected.id}`, { method: 'DELETE' });
      setTeachers(prev => prev.filter(t => t.id !== selected.id));
      closeModal(); notify(`Teacher "${selected.name}" deleted.`);
    } catch (e) { notify(e.message, 'error'); closeModal(); }
    finally { setSubmitting(false); }
  };

  const roleBadge = (name) =>
    name === 'ClassTeacher'
      ? <span key={name} className="badge badge-blue">Class Teacher</span>
      : <span key={name} className="badge badge-purple">Subject Teacher</span>;

  return (
    <div className="admin-page">
      {notification && (
        <div className={`alert alert-${notification.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {notification.type === 'error' ? '⚠' : '✓'} {notification.msg}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Teachers</h1>
          <p className="page-sub">{teachers.length} teacher{teachers.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Teacher</button>
      </div>

      <div className="data-card">
        {loading ? (
          <div className="empty-state"><div className="spinner spinner-dark" /></div>
        ) : teachers.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-icon">👩‍🏫</p>
            <p className="empty-state-text">No teachers yet. Add your first teacher.</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Roles</th>
                  <th>Classes</th>
                  <th>Assignments</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="teacher-cell">
                        {t.profilePicUrl
                          ? <img src={t.profilePicUrl} alt={t.name} className="avatar" />
                          : <div className="avatar-placeholder">{t.name.charAt(0)}</div>
                        }
                        <div>
                          <p className="teacher-info-name">{t.name}</p>
                          <p className="teacher-info-email">{t.email}</p>
                        </div>
                      </div>
                    </td>
                    <td><div className="badge-row">{t.roles.map(r => roleBadge(r))}</div></td>
                    <td>{t.classesManaged?.map(c => c.name).join(', ') || <span className="badge badge-gray">None</span>}</td>
                    <td>{t.subjectAssignments?.length || 0} subject{t.subjectAssignments?.length !== 1 ? 's' : ''}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(t); setModal('assign'); }}>📋 Subjects</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>✏️ Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => { setSelected(t); setModal('delete'); }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Teacher Modal */}
      <Modal isOpen={modal === 'add'} onClose={closeModal} title="Add New Teacher" size="lg">
        <TeacherForm form={form} setForm={setForm} error={formErr} loading={submitting}
          onSubmit={handleCreate} onCancel={closeModal} mode="add" />
      </Modal>

      {/* Edit Teacher Modal */}
      <Modal isOpen={modal === 'edit'} onClose={closeModal} title={`Edit Teacher — ${selected?.name}`} size="lg">
        <TeacherForm form={form} setForm={setForm} error={formErr} loading={submitting}
          onSubmit={handleEdit} onCancel={closeModal} mode="edit" />
      </Modal>

      {/* Assign Subjects Modal */}
      <Modal isOpen={modal === 'assign' && !!selected} onClose={closeModal}
        title={`Subject Assignments — ${selected?.name}`} size="lg">
        {selected && (
          <AssignmentsModal teacher={selected} classes={classes} onClose={closeModal} />
        )}
      </Modal>

      {/* Delete Confirm */}
      <Modal isOpen={modal === 'delete'} onClose={closeModal} title="Delete Teacher" size="sm">
        <div className="confirm-body">
          <p className="confirm-icon">⚠️</p>
          <p className="confirm-msg">Delete <strong>{selected?.name}</strong>?</p>
          <p className="confirm-sub">Their login, assignments, and all related data will be permanently removed.</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={submitting}>
            {submitting ? <span className="spinner" /> : 'Yes, Delete'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
