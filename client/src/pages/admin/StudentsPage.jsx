import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { byClassName } from '../../utils/classOrder';
import { byRoll } from '../../utils/rollOrder';
import Modal from '../../components/Modal';
import './admin.css';

const EMPTY_FORM = { name: '', rollNumber: '', classId: '' };
// Only name and rollNumber are required; every other column is optional profile data.
// Importing again with the same roll numbers updates those students instead of skipping them.
const CSV_TEMPLATE = [
  'name,rollNumber,fatherName,section,admissionNo,admissionDate,dateOfBirth,bloodGroup,idMark1,idMark2,address,aadhaarNo,apaarNo,phoneRes,parentPhone',
  'Amulya Yalamakurthi,001,Ravi Kumar,A,ADM-1023,01-06-2021,15-06-2015,B+,Mole on left hand,,"12-3, Main Road, Kaikalur",1234 5678 9012,,08677-123456,9876543210',
  'Bindhu Sri Namburi,002,Srinivas,A,ADM-1024,01-06-2021,02-03-2015,O+,,,Gudivada,,,,9876500011',
].join('\n');

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
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
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
  // Opened from the top bar's "+ New" (…?new=1)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') { openAdd(); window.history.replaceState({}, '', window.location.pathname); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Search by name or roll; school class order, then roll number
  const q = search.trim().toLowerCase();
  const shown = students
    .filter(s => !q || s.name.toLowerCase().includes(q) || String(s.rollNumber).toLowerCase() === q)
    .sort((a, b) => byClassName(a.class?.name || '', b.class?.name || '') || byRoll(a, b));

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
        <input className="form-input" style={{ maxWidth: 280 }} placeholder="🔎 Search name or roll number…" value={search}
          onChange={e => setSearch(e.target.value)} aria-label="Search students" />
        <select className="filter-select" value={filterClass} onChange={e => setFilterClass(e.target.value)} aria-label="Class">
          <option value="">All classes</option>
          {[...classes].sort(byClassName).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {search && <span className="page-sub" style={{ margin: 0 }}>{shown.length} found</span>}
      </div>

      <div className="data-card">
        {loading ? (
          <div className="empty-state"><div className="spinner spinner-dark" /></div>
        ) : shown.length === 0 && students.length > 0 ? (
          <div className="empty-state">
            <p className="empty-state-icon">🔎</p>
            <p className="empty-state-text">No student matches "{search}".</p>
          </div>
        ) : students.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-icon">👦</p>
            <p className="empty-state-text">No students found. Add individually or import via CSV.</p>
          </div>
        ) : (
          <div className="st-groups">
            {/* One small card per student, grouped by class (school order) */}
            {Object.entries(shown.reduce((g, st) => { (g[st.class?.name || '—'] ||= []).push(st); return g; }, {})).map(([cls, list]) => (
              <section key={cls} className="st-group">
                <h3 className="st-group-title">🏛️ {cls} <span>{list.length} student{list.length === 1 ? '' : 's'}</span></h3>
                <div className="st-grid">
                  {list.map(st => (
                    <div key={st.id} className="st-card" role="button" tabIndex={0}
                      onClick={() => navigate(`/admin/students/${st.id}`)}
                      onKeyDown={e => { if (e.key === 'Enter') navigate(`/admin/students/${st.id}`); }}
                      title="Open profile">
                      <span className="st-avatar">{st.name.charAt(0)}</span>
                      <div className="st-who">
                        <strong>{st.name}</strong>
                        <small>Roll {st.rollNumber}</small>
                      </div>
                      <div className="st-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(st)} aria-label={`Edit ${st.name}`} title="Edit name / roll">✏️</button>
                        <button className="btn btn-ghost btn-xs st-del" onClick={() => { setSelected(st); setModal('delete'); }} aria-label={`Delete ${st.name}`} title="Delete">🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
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
            {csvResult.warnings?.length > 0 && (
              <div className="alert alert-info" style={{ marginTop: 12, fontSize: '0.8rem' }}>
                {csvResult.warnings.length} value(s) were left out:{' '}
                {csvResult.warnings.slice(0, 5).map(w => `line ${w.line}: ${w.message}`).join('; ')}
                {csvResult.warnings.length > 5 && ' …'}
              </div>
            )}
            {csvResult.errors?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p className="form-label" style={{ marginBottom: 6 }}>Skipped rows:</p>
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.78rem', color: '#64748b' }}>
                  {csvResult.errors.map((e, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <strong>Line {e.line ?? '—'}</strong>: {e.reason}
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
                Required columns: <code>name,rollNumber</code>. Optional: father's name, section, admission no/date,
                date of birth (dd-mm-yyyy), blood group, identification marks, address, Aadhaar, APAAR, phones,
                <code>parentPhone</code> (WhatsApp). Existing roll numbers are <strong>updated</strong>, new ones added.
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
