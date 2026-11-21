import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { rupees } from './tuition';
import '../admin/admin.css';
import './Tuition.css';

/**
 * Tuition → Students: school students who come for tuition, grouped by tuition class.
 * "+ Add students" picks them from the school list (search a name or open a school class).
 */
export default function TuitionStudentsPage() {
  const { apiCall } = useApi();
  const [students, setStudents] = useState(null);
  const [classes, setClasses] = useState([]);
  const [filterClass, setFilterClass] = useState(() => new URLSearchParams(window.location.search).get('class') || '');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState(null);  // a tuition student: change class / fee
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => Promise.all([apiCall('/api/tuition/students'), apiCall('/api/tuition/classes')])
    .then(([s, c]) => { setStudents(s.students); setClasses(c.classes); })
    .catch((e) => setError(e.message)), [apiCall]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    if (!students) return [];
    const q = search.trim().toLowerCase();
    const list = students.filter((s) => (!filterClass || String(s.tuitionClassId) === String(filterClass)) && (!q || s.name.toLowerCase().includes(q)));
    const by = new Map();
    list.forEach((s) => { if (!by.has(s.tuitionClass)) by.set(s.tuitionClass, []); by.get(s.tuitionClass).push(s); });
    return [...by.entries()];
  }, [students, filterClass, search]);

  const remove = async (s) => {
    if (!window.confirm(`Remove ${s.name} from tuition? Their fee records are removed too.`)) return;
    try { await apiCall(`/api/tuition/students/${s.id}`, { method: 'DELETE' }); setNotice(`${s.name} removed from tuition.`); load(); }
    catch (e) { setError(e.message); }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">👦 Tuition students</h1>
          <p className="page-sub">{students ? `${students.length} student${students.length === 1 ? '' : 's'} in tuition.` : ''} Only the school students you add are here.</p>
        </div>
        <button className="btn btn-primary" disabled={!classes.length} title={!classes.length ? 'Make a tuition class first' : ''} onClick={() => setAdding(true)}>+ Add students</button>
      </div>
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {classes.length === 0 && students && <div className="alert alert-info" style={{ marginBottom: 12 }}><div>First make your tuition classes (Setup → Tuition classes), then add students to them.</div></div>}

      <div className="tu-toolbar">
        <input className="form-input" style={{ maxWidth: 260 }} placeholder="🔎 Search a name…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <select className="form-select" style={{ maxWidth: 220 }} value={filterClass} onChange={(e) => setFilterClass(e.target.value)} aria-label="Tuition class">
          <option value="">All tuition classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!students ? <div className="spinner spinner-dark" /> : groups.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
          <p className="empty-state-icon">👦</p>
          <p className="empty-state-text">{students.length ? 'Nobody matches.' : 'No tuition students yet. Click "+ Add students".'}</p>
        </div></div>
      ) : groups.map(([cls, list]) => (
        <section key={cls} className="tu-group">
          <h3>🏫 {cls} <span>{list.length} student{list.length === 1 ? '' : 's'}</span></h3>
          <div className="tu-sgrid">
            {list.map((s) => (
              <div key={s.id} className="tu-scard">
                <span className="tu-avatar">{s.name.charAt(0)}</span>
                <div className="tu-who">
                  <strong>{s.name}</strong>
                  <small>School: {s.schoolClass} · {rupees(s.fee)}/month{s.feeOverride !== null ? ' (special)' : ''}</small>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={() => setEdit({ ...s, feeInput: s.feeOverride ?? '' })} aria-label={`Edit ${s.name}`} title="Change class or fee">✏️</button>
                <button className="btn btn-ghost btn-xs tu-del" onClick={() => remove(s)} aria-label={`Remove ${s.name}`} title="Remove from tuition">🗑</button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {adding && <AddStudents classes={classes} defaultClass={filterClass} onClose={() => setAdding(false)}
        onAdded={(msg) => { setAdding(false); setNotice(msg); load(); }} />}

      {edit && (
        <EditStudent student={edit} classes={classes} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      )}
    </div>
  );
}

function AddStudents({ classes, defaultClass, onClose, onAdded }) {
  const { apiCall } = useApi();
  const [tuitionClass, setTuitionClass] = useState(defaultClass || String(classes[0]?.id || ''));
  const [schoolClasses, setSchoolClasses] = useState([]);
  const [schoolClass, setSchoolClass] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [picked, setPicked] = useState({});   // id → { id, name, className }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { apiCall('/api/tuition/school-classes').then((d) => setSchoolClasses(d.classes)).catch(() => {}); }, [apiCall]);
  useEffect(() => {
    if (!schoolClass && q.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => {
      apiCall(`/api/tuition/school-students?${schoolClass ? `classId=${schoolClass}` : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
        .then((d) => setFound(d.students)).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [apiCall, q, schoolClass]);

  const toggle = (s) => setPicked((p) => { const n = { ...p }; if (n[s.id]) delete n[s.id]; else n[s.id] = s; return n; });
  const allShownPicked = found.length > 0 && found.every((s) => picked[s.id]);
  const pickAll = () => setPicked((p) => { const n = { ...p }; found.forEach((s) => { if (allShownPicked) delete n[s.id]; else n[s.id] = s; }); return n; });
  const count = Object.keys(picked).length;

  const add = async () => {
    setBusy(true); setError('');
    try {
      const d = await apiCall('/api/tuition/students', { method: 'POST', body: { studentIds: Object.keys(picked).map(Number), classId: Number(tuitionClass) } });
      const cls = classes.find((c) => String(c.id) === String(tuitionClass))?.name;
      onAdded(`✅ ${d.added} student${d.added === 1 ? '' : 's'} added to ${cls}.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2 className="modal-title">Add students to tuition</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
        <div className="form-group">
          <label className="form-label">Into tuition class</label>
          <select className="form-select" value={tuitionClass} onChange={(e) => setTuitionClass(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label className="form-label">Find school students</label>
        <div className="tu-toolbar" style={{ marginBottom: 0 }}>
          <input className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder="Type a name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <select className="form-select" style={{ maxWidth: 180 }} value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)} aria-label="School class">
            <option value="">or pick a school class…</option>
            {schoolClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {found.length > 0 && (
          <div className="tu-pick">
            <label style={{ fontWeight: 700 }}><input type="checkbox" checked={allShownPicked} onChange={pickAll} /> Tick all {found.length}</label>
            {found.map((s) => (
              <label key={s.id}>
                <input type="checkbox" checked={!!picked[s.id]} onChange={() => toggle(s)} />
                {s.name}<small>{s.class.name} · Roll {s.rollNumber}</small>
              </label>
            ))}
          </div>
        )}
        {(q.trim().length >= 2 || schoolClass) && found.length === 0 && <p className="tu-muted" style={{ marginTop: 8 }}>No school students found (students already in tuition are not shown).</p>}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="tu-muted">{count} chosen</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !count || !tuitionClass} onClick={add}>{busy ? <span className="spinner" /> : `Add ${count || ''}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditStudent({ student, classes, onClose, onSaved }) {
  const { apiCall } = useApi();
  const [classId, setClassId] = useState(String(student.tuitionClassId));
  const [fee, setFee] = useState(student.feeInput === null ? '' : String(student.feeInput));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const classFee = classes.find((c) => String(c.id) === classId)?.monthlyFee ?? 0;

  const save = async () => {
    setBusy(true); setError('');
    try {
      await apiCall(`/api/tuition/students/${student.id}`, { method: 'PUT', body: { classId: Number(classId), feeOverride: fee === '' ? null : fee } });
      onSaved();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">{student.name}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
        <div className="form-group">
          <label className="form-label">Tuition class</label>
          <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Monthly fee for this student (₹)</label>
          <input className="form-input" type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} placeholder={`Class fee: ${classFee}`} style={{ maxWidth: 180 }} />
          <p className="tu-muted" style={{ marginTop: 4 }}>Leave empty to use the class fee ({rupees(classFee)}). Type a number for a discount or special fee.</p>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
