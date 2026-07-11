import { useEffect, useState, useCallback, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import Modal from '../../components/Modal';
import './admin.css';

const EMPTY_FORM = { name: '', rollNumber: '', classId: '' };
const CSV_TEMPLATE = 'name,rollNumber\nJohn Doe,001\nJane Smith,002';

export default function StudentsPage() {
  const { apiCall, apiUpload } = useApi();
  const [students,  setStudents]  = useState([]);
  const [classes,   setClasses]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null);
  const [selected,  setSelected]  = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [formErr,   setFormErr]   = useState('');
  const [submitting,setSubmitting]= useState(false);
  const [filterClass, setFilterClass] = useState('');
  const [notification, setNotification] = useState(null);

  // CSV import state
  const csvRef = useRef(null);
  const [csvFile, setCsvFile]       = useState(null);
  const [csvClassId, setCsvClassId] = useState('');
  const [csvResult, setCsvResult]   = useState(null);
  const [csvErr, setCsvErr]         = useState('');

  const notify = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const load = useCallback(async (classId = filterClass) => {
    setLoading(true);
    try {
      const url = classId ? `/api/admin/students?classId=${classId}` : '/api/admin/students';
      const [sRes, cRes] = await Promise.all([
        apiCall(url),
        classes.length ? Promise.resolve({ classes }) : apiCall('/api/admin/classes'),
      ]);
      setStudents(sRes.students);
      if (cRes.classes) setClasses(cRes.classes);
    } catch (e) { notify(e.message, 'error'); }
    finally { setLoading(false); }
  }, [filterClass]);

  useEffect(() => { load(); }, [filterClass]);

  const openAdd = () => { setForm(EMPTY_FORM); setFormErr(''); setModal('add'); };
  const openEdit = (s) => { setSelected(s); setForm({ name: s.name, rollNumber: s.rollNumber, classId: s.classId }); setFormErr(''); setModal('edit'); };
  const closeModal = () => { setModal(null); setSelected(null); setFormErr(''); setCsvFile(null); setCsvResult(null); setCsvErr(''); };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormErr('Name is required.'); return; }
    if (!form.rollNumber.trim()) { setFormErr('Roll number is required.'); return; }
    if (!form.classId) { setFormErr('Class is required.'); return; }
    setSubmitting(true); setFormErr('');
    try {
      const res = await apiCall('/api/admin/students', { method: 'POST', body: form });
      setStudents(prev => [...prev, res.student]);
      closeModal(); notify(`Student "${res.student.name}" added.`);
    } catch (e) { setFormErr(e.message); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormErr('Name is required.'); return; }
    if (!form.rollNumber.trim()) { setFormErr('Roll number is required.'); return; }
    setSubmitting(true); setFormErr('');
    try {
      const res = await apiCall(`/api/admin/students/${selected.id}`, { method: 'PUT', body: form });
      setStudents(prev => prev.map(s => s.id === selected.id ? res.student : s));
      closeModal(); notify(`Student "${res.student.name}" updated.`);
    } catch (e) { setFormErr(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await apiCall(`/api/admin/students/${selected.id}`, { method: 'DELETE' });
      setStudents(prev => prev.filter(s => s.id !== selected.id));
      closeModal(); notify(`Student "${selected.name}" deleted.`);
    } catch (e) { notify(e.message, 'error'); closeModal(); }
    finally { setSubmitting(false); }
  };

  const handleCSVImport = async () => {
    if (!csvFile) { setCsvErr('Please select a CSV file.'); return; }
    if (!csvClassId) { setCsvErr('Please select a class to import into.'); return; }
    setSubmitting(true); setCsvErr(''); setCsvResult(null);
    try {
      const fd = new FormData();
      fd.append('csv', csvFile);
      fd.append('classId', csvClassId);
      const res = await apiUpload('/api/admin/students/bulk-import', fd);
      setCsvResult(res);
      load(csvClassId); // Refresh list
    } catch (e) { setCsvErr(e.message); }
    finally { setSubmitting(false); }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'students-template.csv' });
    a.click(); URL.revokeObjectURL(url);
  };

  const StudentForm = () => (
    <form onSubmit={modal === 'add' ? handleCreate : handleEdit}>
      {formErr && <div className="alert alert-error">⚠ {formErr}</div>}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Full Name <span className="required">*</span></label>
          <input className="form-input" placeholder="e.g. Ravi Kumar" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Roll Number <span className="required">*</span></label>
          <input className="form-input" placeholder="e.g. 001" value={form.rollNumber}
            onChange={e => setForm(f => ({ ...f, rollNumber: e.target.value }))} required />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Class <span className="required">*</span></label>
        <select className="form-select" value={form.classId}
          onChange={e => setForm(f => ({ ...f, classId: e.target.value }))} required>
          <option value="">Select a class…</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="modal-footer" style={{ padding: '16px 0 0', border: 'none' }}>
        <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? <span className="spinner" /> : (modal === 'edit' ? 'Save Changes' : 'Add Student')}
        </button>
      </div>
    </form>
  );

  return (
    <div className="admin-page">
      {notification && (
        <div className={`alert alert-${notification.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {notification.type === 'error' ? '⚠' : '✓'} {notification.msg}
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-sub">{students.length} student{students.length !== 1 ? 's' : ''}{filterClass ? ' in selected class' : ' total'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => setModal('csv')}>📥 Import CSV</button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Student</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Filter by class:</label>
        <select className="filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="data-card">
        {loading ? (
          <div className="empty-state"><div className="spinner spinner-dark" /></div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-icon">👦</p>
            <p className="empty-state-text">No students found. Add individually or import via CSV.</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Roll No.</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td><span className="badge badge-gray">{s.rollNumber}</span></td>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{s.name}</td>
                    <td><span className="badge badge-blue">{s.class?.name}</span></td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>✏️ Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => { setSelected(s); setModal('delete'); }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Student Modal */}
      <Modal isOpen={modal === 'add'} onClose={closeModal} title="Add Student">
        <StudentForm />
      </Modal>

      {/* Edit Student Modal */}
      <Modal isOpen={modal === 'edit'} onClose={closeModal} title={`Edit — ${selected?.name}`}>
        <StudentForm />
      </Modal>

      {/* Delete Confirm */}
      <Modal isOpen={modal === 'delete'} onClose={closeModal} title="Delete Student" size="sm">
        <div className="confirm-body">
          <p className="confirm-icon">🗑️</p>
          <p className="confirm-msg">Delete <strong>{selected?.name}</strong>?</p>
          <p className="confirm-sub">Roll No. {selected?.rollNumber} — {selected?.class?.name}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={submitting}>
            {submitting ? <span className="spinner" /> : 'Yes, Delete'}
          </button>
        </div>
      </Modal>

      {/* CSV Import Modal */}
      <Modal isOpen={modal === 'csv'} onClose={closeModal} title="Bulk Import Students via CSV" size="md">
        {csvResult ? (
          <>
            <div className="alert alert-success">
              ✓ {csvResult.message}
            </div>
            {csvResult.errors?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p className="form-label" style={{ marginBottom: 6 }}>Skipped rows:</p>
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.78rem', color: '#64748b' }}>
                  {csvResult.errors.map((e, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <strong>{e.row?.name || '—'}</strong>: {e.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={closeModal}>Done</button>
            </div>
          </>
        ) : (
          <>
            {csvErr && <div className="alert alert-error">⚠ {csvErr}</div>}
            <div className="form-group">
              <label className="form-label">Target Class <span className="required">*</span></label>
              <select className="form-select" value={csvClassId} onChange={e => setCsvClassId(e.target.value)}>
                <option value="">Select class to import into…</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CSV File <span className="required">*</span></label>
              <div className="file-input-wrap" onClick={() => csvRef.current?.click()}>
                <input ref={csvRef} type="file" accept=".csv" onChange={e => setCsvFile(e.target.files[0])} />
                <p className="file-input-label">
                  {csvFile ? `✓ ${csvFile.name}` : <><span>Click to upload</span> a .csv file</>}
                </p>
              </div>
              <p className="form-hint">
                CSV format: <code>name,rollNumber</code> — first row must be the header.
                {' '}<button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={downloadTemplate}>
                  ⬇ Download Template
                </button>
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCSVImport} disabled={submitting}>
                {submitting ? <span className="spinner" /> : '📥 Import'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
