/**
 * Admin → 📷 Photo day: take a whole class's photos one after another.
 * Pick a class; the camera stays on; after each "Save & next" it moves to the next
 * student (by default only students without a photo). Photos go on report cards and the app.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import CameraCapture from '../../components/students/CameraCapture';
import { uploadStudentPhoto } from '../../utils/photo';
import { byClassName } from '../../components/SubjectFields';
import './admin.css';
import './PhotoDay.css';

export default function PhotoDayPage() {
  const { apiCall, apiUpload } = useApi();
  const [params, setParams] = useSearchParams();
  const classId = params.get('classId') || '';
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState(null);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [currentId, setCurrentId] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(0);           // photos taken in this session

  useEffect(() => { apiCall('/api/admin/classes').then((d) => setClasses([...d.classes].sort(byClassName))).catch((e) => setError(e.message)); }, [apiCall]);

  const load = useCallback(async () => {
    if (!classId) { setStudents(null); return; }
    const d = await apiCall(`/api/students/class/${classId}`);
    setStudents(d.students);
    return d.students;
  }, [apiCall, classId]);

  useEffect(() => {
    setError(''); setCurrentId(null); setDone(0);
    load().then((list) => { if (list) setCurrentId((list.find((s) => !s.hasPhoto) || list[0])?.id ?? null); }).catch((e) => setError(e.message));
  }, [load]);

  const queue = useMemo(() => (students || []).filter((s) => !onlyMissing || !s.hasPhoto || s.id === currentId), [students, onlyMissing, currentId]);
  const current = students?.find((s) => s.id === currentId) || null;
  const withPhoto = students ? students.filter((s) => s.hasPhoto).length : 0;

  const nextAfter = (list, id) => {
    const i = list.findIndex((s) => s.id === id);
    const after = list.slice(i + 1).concat(list.slice(0, Math.max(i, 0)));
    return (onlyMissing ? after.find((s) => !s.hasPhoto) : after[0])?.id ?? null;
  };

  const save = async (blob) => {
    await uploadStudentPhoto(apiUpload, current.id, blob);
    setDone((n) => n + 1);
    const list = (students || []).map((s) => (s.id === current.id ? { ...s, hasPhoto: true, photoUpdatedAt: new Date().toISOString() } : s));
    setStudents(list);
    setCurrentId(nextAfter(list, current.id));
  };

  const skip = () => setCurrentId(nextAfter(students, currentId) ?? currentId);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">📷 Photo day</h1>
          <p className="page-subtitle">Take a class's photos one after another. They appear on report cards and in the Student App.</p>
        </div>
      </div>

      <div className="data-card an-card">
        <div className="at-toolbar" style={{ marginBottom: 0 }}>
          <select className="form-select" style={{ maxWidth: 260 }} value={classId} aria-label="Class"
            onChange={(e) => setParams(e.target.value ? { classId: e.target.value } : {})}>
            <option value="">Choose a class…</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="an-pick">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            <span>Only students without a photo</span>
          </label>
          {students && <span className="badge badge-gray">{withPhoto} of {students.length} have a photo{done ? ` · ${done} taken now` : ''}</span>}
        </div>
      </div>

      {error && <div className="alert alert-error">⚠ {error}</div>}

      {students && (
        <div className="pd-layout">
          <div className="data-card pd-camera">
            {current ? (
              <>
                <CameraCapture key={classId} title={`${current.name} · Roll ${current.rollNumber}`} useLabel="Save & next" onUse={save} />
                <div className="pd-skip">
                  <button className="btn btn-ghost btn-sm" onClick={skip}>Skip this student ›</button>
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <p className="empty-state-icon">🎉</p>
                <p className="empty-state-text">Every student in this class has a photo.</p>
                <button className="btn btn-ghost btn-sm" onClick={() => { setOnlyMissing(false); setCurrentId(students[0]?.id ?? null); }}>Retake someone's photo</button>
              </div>
            )}
          </div>

          <div className="data-card pd-list">
            <ul>
              {(onlyMissing ? queue : students).map((s) => (
                <li key={s.id}>
                  <button className={`pd-row${s.id === currentId ? ' pd-on' : ''}`} onClick={() => setCurrentId(s.id)}>
                    {s.hasPhoto
                      ? <img src={`/api/students/${s.id}/photo?v=${encodeURIComponent(s.photoUpdatedAt || '')}`} alt="" className="pd-thumb" />
                      : <span className="pd-thumb pd-none">{s.name.charAt(0)}</span>}
                    <span className="pd-name">{s.rollNumber} · {s.name}</span>
                    {s.hasPhoto && <span className="pd-tick" aria-label="Has a photo">✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
