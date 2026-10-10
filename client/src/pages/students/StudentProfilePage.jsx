import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { downloadReports } from '../../components/report/downloadReport';
import { formatDate, ageFrom } from '../../utils/school';
import { gradeTone } from '../../utils/grades';
import { waLabel, waPending, formatPhone } from '../../utils/whatsappStatus';
import '../admin/admin.css';
import './StudentProfile.css';

const PARTS = ['Reading', 'Writing', 'Dictation'];

// Profile fields in the order they appear on the report's Bio Data.
const FIELDS = [
  { key: 'fatherName',    label: "Father's / Guardian's Name" },
  { key: 'section',       label: 'Section' },
  { key: 'admissionNo',   label: 'Admission No.' },
  { key: 'admissionDate', label: 'Admission Date', type: 'date' },
  { key: 'dateOfBirth',   label: 'Date of Birth', type: 'date' },
  { key: 'bloodGroup',    label: 'Blood Group', options: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  { key: 'idMark1',       label: 'Identification Mark 1' },
  { key: 'idMark2',       label: 'Identification Mark 2' },
  { key: 'aadhaarNo',     label: 'Aadhaar No.' },
  { key: 'apaarNo',       label: 'APAAR No.' },
  { key: 'phoneRes',      label: 'Phone (Res.)' },
  { key: 'parentPhone',   label: 'Parent Cell (WhatsApp)', hint: '10-digit mobile number — results are sent here' },
  { key: 'address',       label: 'Address', wide: true, textarea: true },
];

const toInputDate = (v) => (v ? String(v).slice(0, 10) : '');

/** Shrink a photo in the browser (max 480 px, JPEG) before uploading. */
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 480 / Math.max(img.width, img.height));
      const canvas = Object.assign(document.createElement('canvas'), {
        width: Math.round(img.width * scale), height: Math.round(img.height * scale),
      });
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read the photo.'))), 'image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('That file is not a photo.'));
    img.src = URL.createObjectURL(file);
  });
}

export default function StudentProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { apiCall, apiUpload } = useApi();
  const { activeRole } = useAuth();
  const isAdmin = activeRole === 'Admin';

  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice]   = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy]       = useState({});   // `pdf-${examId}` / `wa-${examId}`
  const [wa, setWa]           = useState({});   // examId → message status for this student
  const [waConfigured, setWaConfigured] = useState(true);
  const fileRef = useRef(null);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 5000); };

  const load = useCallback(async () => {
    try {
      const res = await apiCall(`/api/students/${id}`);
      setData(res);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load student.');
    }
  }, [apiCall, id]);

  useEffect(() => { load(); }, [load]);

  // WhatsApp status per exam (admin only).
  const loadWa = useCallback(async () => {
    if (!isAdmin || !data) return;
    const entries = await Promise.all(data.reports.map(async r => {
      try {
        const res = await apiCall(`/api/admin/whatsapp/status?examId=${r.exam.id}&classId=${data.student.classId}`);
        setWaConfigured(res.configured);
        return [r.exam.id, res.messages[data.student.id] || null];
      } catch { return [r.exam.id, null]; }
    }));
    setWa(Object.fromEntries(entries));
  }, [apiCall, isAdmin, data]);

  useEffect(() => { loadWa(); }, [loadWa]);

  // While a message is sending, check again every few seconds.
  useEffect(() => {
    if (!Object.values(wa).some(m => waPending(m?.status))) return;
    const t = setTimeout(loadWa, 3000);
    return () => clearTimeout(t);
  }, [wa, loadWa]);

  if (error) return (
    <div className="admin-page"><div className="empty-state">
      <p className="empty-state-text" style={{ color: '#dc2626' }}>⚠ {error}</p>
      <button className="btn btn-primary" onClick={() => navigate(-1)}>← Back</button>
    </div></div>
  );
  if (!data) return <div className="admin-page"><div className="empty-state"><div className="spinner spinner-dark" /></div></div>;

  const st = data.student;
  const photoUrl = st.hasPhoto ? `/api/students/${st.id}/photo?v=${encodeURIComponent(st.photoUpdatedAt || '')}` : null;
  const backTo = isAdmin ? `/admin/classes/${st.classId}` : '/class-teacher/dashboard';

  const startEdit = () => {
    setForm({
      name: st.name, rollNumber: st.rollNumber,
      ...Object.fromEntries(FIELDS.map(f => [f.key, f.type === 'date' ? toInputDate(st[f.key]) : (st[f.key] ?? '')])),
    });
    setFormError(''); setEditing(true);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const body = Object.fromEntries(FIELDS.map(f => [f.key, form[f.key]]));
      if (isAdmin) { body.name = form.name; body.rollNumber = form.rollNumber; }
      await apiCall(`/api/students/${st.id}/profile`, { method: 'PUT', body });
      setEditing(false); flash('✅ Profile saved.'); load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const blob = await resizePhoto(file);
      const fd = new FormData();
      fd.append('photo', blob, 'photo.jpg');
      await apiUpload(`/api/students/${st.id}/photo`, fd, 'PUT');
      flash('✅ Photo saved.'); load();
    } catch (err) { flash(`⚠ ${err.message}`); }
    finally { setPhotoBusy(false); }
  };

  const removePhoto = async () => {
    if (!window.confirm('Remove this photo?')) return;
    setPhotoBusy(true);
    try { await apiCall(`/api/students/${st.id}/photo`, { method: 'DELETE' }); load(); }
    catch (err) { flash(`⚠ ${err.message}`); }
    finally { setPhotoBusy(false); }
  };

  const downloadPdf = async (examId) => {
    setBusy(b => ({ ...b, [`pdf-${examId}`]: true }));
    try { await downloadReports(apiCall, { examId, classId: st.classId, studentId: st.id }); }
    catch (err) { flash(`⚠ ${err.message}`); }
    finally { setBusy(b => ({ ...b, [`pdf-${examId}`]: false })); }
  };

  const sendWhatsApp = async (examId, resend) => {
    setBusy(b => ({ ...b, [`wa-${examId}`]: true }));
    try {
      const res = await apiCall('/api/admin/whatsapp/send', {
        method: 'POST', body: { examId, classId: st.classId, studentIds: [st.id], resend },
      });
      if (res.queued) flash('📤 Sending on WhatsApp…');
      else flash(`⚠ Not sent: ${res.skipped[0]?.reason || 'unknown reason'}`);
      loadWa();
    } catch (err) { flash(`⚠ ${err.message}`); }
    finally { setBusy(b => ({ ...b, [`wa-${examId}`]: false })); }
  };

  return (
    <div className="admin-page sp-page">
      <div className="detail-breadcrumb">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(backTo)}>← {st.class.name}</button>
        <span style={{ color: '#94a3b8', margin: '0 6px' }}>/</span>
        <span style={{ fontWeight: 600 }}>{st.name}</span>
      </div>

      {notice && <div className={`alert ${notice.startsWith('⚠') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{notice}</div>}

      {/* ── Header ── */}
      <div className="data-card sp-header">
        <div className="sp-photo">
          {photoUrl ? <img src={photoUrl} alt={`Photo of ${st.name}`} /> : <span className="sp-initial">{st.name.charAt(0)}</span>}
          <div className="sp-photo-actions">
            <button className="btn btn-ghost btn-xs" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              {photoBusy ? <span className="spinner spinner-dark" /> : st.hasPhoto ? 'Change photo' : '＋ Add photo'}
            </button>
            {st.hasPhoto && <button className="btn btn-ghost btn-xs" disabled={photoBusy} onClick={removePhoto}>Remove</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
        </div>
        <div className="sp-head-info">
          <h1 className="page-title" style={{ marginBottom: 4 }}>{st.name}</h1>
          <p className="page-sub">
            {st.class.name}{st.section ? ` · Section ${st.section}` : ''} · Roll No. <strong>{st.rollNumber}</strong>
            {st.class.classTeacher && <> · Class Teacher: {st.class.classTeacher.name}</>}
          </p>
          <div className="sp-chips">
            <span className={`badge ${st.parentPhone ? 'badge-green' : 'badge-red'}`}>
              📱 {st.parentPhone ? formatPhone(st.parentPhone) : 'No parent number'}
            </span>
            {st.admissionNo && <span className="badge badge-gray">Adm. {st.admissionNo}</span>}
            {st.dateOfBirth && <span className="badge badge-gray">{ageFrom(st.dateOfBirth)}</span>}
          </div>
        </div>
      </div>

      {/* ── Profile ── */}
      <div className="data-card sp-section">
        <div className="sp-section-head">
          <h2>Profile (Bio Data)</h2>
          {!editing && <button className="btn btn-primary btn-sm" onClick={startEdit}>✏️ Edit profile</button>}
        </div>

        {editing ? (
          <form onSubmit={saveProfile}>
            {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
            <div className="sp-grid">
              {isAdmin && (
                <>
                  <label className="sp-field"><span>Student Name</span>
                    <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                  </label>
                  <label className="sp-field"><span>Roll No.</span>
                    <input className="form-input" value={form.rollNumber} onChange={e => setForm(f => ({ ...f, rollNumber: e.target.value }))} required />
                  </label>
                </>
              )}
              {FIELDS.map(f => (
                <label key={f.key} className={`sp-field ${f.wide ? 'sp-wide' : ''}`}>
                  <span>{f.label}</span>
                  {f.options ? (
                    <select className="form-select" value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}>
                      {f.options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                    </select>
                  ) : f.textarea ? (
                    <textarea className="form-textarea" rows={2} value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))} />
                  ) : (
                    <input
                      className="form-input"
                      type={f.type || (f.key === 'parentPhone' ? 'tel' : 'text')}
                      inputMode={f.key === 'parentPhone' ? 'numeric' : undefined}
                      value={form[f.key]}
                      onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                    />
                  )}
                  {f.hint && <small>{f.hint}</small>}
                </label>
              ))}
            </div>
            <div className="sp-form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Save profile'}</button>
            </div>
          </form>
        ) : (
          <dl className="sp-grid sp-view">
            {FIELDS.map(f => {
              const raw = st[f.key];
              const val = f.type === 'date' ? formatDate(raw) : f.key === 'parentPhone' ? formatPhone(raw) : raw;
              return (
                <div key={f.key} className={`sp-field ${f.wide ? 'sp-wide' : ''}`}>
                  <dt>{f.label}</dt>
                  <dd className={val ? '' : 'sp-empty'}>{val || 'Not added'}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>

      {/* ── Exam reports ── */}
      <div className="sp-section-head" style={{ marginTop: 8 }}>
        <h2>Exam Reports</h2>
      </div>
      {isAdmin && !waConfigured && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          ℹ️ WhatsApp sending isn't set up yet (add <code>RICHAUTOMATE_API_KEY</code> in Render). Reports can still be downloaded.
        </div>
      )}
      {data.reports.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 32 }}>
          <p className="empty-state-text">No exams for {st.class.name} yet.</p>
        </div></div>
      ) : data.reports.map(({ exam, subjects, highestGpa, result }) => {
        const msg = wa[exam.id];
        const label = waLabel(msg?.status);
        const alreadySent = ['sent', 'delivered', 'read'].includes(msg?.status);
        return (
          <div key={exam.id} className="data-card sp-report">
            <div className="sp-report-head">
              <div>
                <h3>{exam.name}</h3>
                <div className="sp-chips">
                  <span className={`badge ${exam.status === 'Closed' ? 'badge-green' : 'badge-blue'}`}>{exam.status === 'Closed' ? 'Finalized' : 'In progress'}</span>
                  {!result.complete && <span className="badge badge-amber">Marks incomplete</span>}
                  {label && <span className={`badge badge-${label.tone}`} title={msg.error || ''}>{label.icon} WhatsApp: {label.text}</span>}
                </div>
              </div>
              <div className="sp-report-actions">
                <button className="btn btn-primary btn-sm" disabled={busy[`pdf-${exam.id}`]} onClick={() => downloadPdf(exam.id)}>
                  {busy[`pdf-${exam.id}`] ? <span className="spinner" /> : '⬇ Download report'}
                </button>
                {isAdmin && (
                  <button
                    className="btn btn-whatsapp btn-sm"
                    disabled={busy[`wa-${exam.id}`] || waPending(msg?.status) || !result.complete || !st.parentPhone || !waConfigured}
                    title={!st.parentPhone ? 'Add the parent cell number first' : !result.complete ? 'Marks are not complete yet' : ''}
                    onClick={() => (alreadySent
                      ? window.confirm('This result was already sent. Send it again?') && sendWhatsApp(exam.id, true)
                      : sendWhatsApp(exam.id, false))}
                  >
                    {busy[`wa-${exam.id}`] ? <span className="spinner" /> : alreadySent ? '↻ Send again' : msg?.status === 'failed' ? '↻ Retry WhatsApp' : '💬 Send on WhatsApp'}
                  </button>
                )}
              </div>
            </div>

            <div className="data-table-wrap">
              <table className="data-table sp-marks">
                <thead>
                  <tr><th>Subject</th><th>Marks</th>{PARTS.map(p => <th key={p}>{p}</th>)}<th>Total</th><th>Grade</th><th>Points</th></tr>
                </thead>
                <tbody>
                  {subjects.map((sub, i) => {
                    const r = result.subjects[i];
                    const cmm = sub.componentMaxMarks;
                    const cell = (v, of) => (v === null || v === undefined ? <span className="sp-dash">—</span> : <>{v}<small> /{of}</small></>);
                    return (
                      <tr key={sub.id}>
                        <td className="sp-subject">{sub.name}</td>
                        <td>{cell(r.main, cmm ? cmm.Main : sub.maxMarks)}</td>
                        {PARTS.map(p => <td key={p}>{cmm && p in cmm ? cell(r.parts[p], cmm[p]) : <span className="sp-dash">—</span>}</td>)}
                        <td className="sp-strong">{cell(r.total, sub.maxMarks)}</td>
                        <td>{r.grade ? <span className={`badge badge-${gradeTone(r.grade)}`}>{r.grade}</span> : <span className="sp-dash">—</span>}</td>
                        <td>{r.points ?? <span className="sp-dash">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="sp-summary">
              <div><strong>{result.total}/{result.maxTotal}</strong><span>Total</span></div>
              <div><strong>{result.percentage ?? '—'}{result.percentage !== null && '%'}</strong><span>Percentage</span></div>
              <div><strong>{result.gpa ?? '—'}</strong><span>GPA</span></div>
              <div><strong>{result.grade ?? '—'}</strong><span>Grade</span></div>
              <div><strong>{highestGpa ?? '—'}</strong><span>Highest GPA in class</span></div>
            </div>
            {msg?.status === 'failed' && msg.error && <p className="sp-wa-error">WhatsApp error: {msg.error}</p>}
          </div>
        );
      })}
    </div>
  );
}
