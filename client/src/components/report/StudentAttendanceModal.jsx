/**
 * Student profile → an exam → "📅 Attendance": one student's report-card attendance.
 * Working days belong to the whole class for that exam (shared); days present is this student's.
 */
import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';

export default function StudentAttendanceModal({ exam, student, onClose, onSaved }) {
  const { apiCall } = useApi();
  const [loaded, setLoaded] = useState(null);   // { workingDays }
  const [days, setDays] = useState('');
  const [present, setPresent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall(`/api/students/report-attendance?examId=${exam.id}&classId=${student.classId}`)
      .then((d) => {
        setLoaded(d);
        setDays(d.workingDays ?? '');
        setPresent(d.students.find((s) => s.id === student.id)?.present ?? '');
      })
      .catch((e) => setError(e.message));
  }, [apiCall, exam.id, student.classId, student.id]);

  const d = Number(days), p = Number(present);
  const daysOk = Number.isInteger(d) && d >= 1 && d <= 366;
  const presentOk = present === '' || (Number.isInteger(p) && p >= 0 && (!daysOk || p <= d));
  const changesClass = loaded && loaded.workingDays !== null && String(loaded.workingDays) !== String(days);
  const digits = (v) => v.replace(/\D/g, '').slice(0, 3);

  const save = async () => {
    setBusy(true); setError('');
    try {
      await apiCall('/api/students/report-attendance', {
        method: 'PUT',
        body: { examId: exam.id, classId: student.classId, workingDays: days, records: [{ studentId: student.id, present }] },
      });
      onSaved(`✅ ${exam.name}: attendance saved${present !== '' ? ` (${present} of ${days} days)` : ''}.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 className="modal-title">📅 Attendance · {exam.name}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!loaded ? (error ? <div className="alert alert-error">⚠ {error}</div> : <div className="spinner spinner-dark" />) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <p className="tab-desc" style={{ margin: 0 }}>For {student.name}'s report card: Working days / Days present / Attendance %.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span className="form-label" style={{ margin: 0 }}>Working days (whole class)</span>
                <input className="form-input" style={{ width: 140, fontWeight: 700 }} inputMode="numeric" value={days} placeholder="e.g. 60"
                  onChange={(e) => setDays(digits(e.target.value))} autoFocus={loaded.workingDays === null} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span className="form-label" style={{ margin: 0 }}>Days present</span>
                <input className="form-input" style={{ width: 140, fontWeight: 700, ...(presentOk ? {} : { borderColor: '#dc2626', background: '#fef2f2' }) }}
                  inputMode="numeric" value={present} placeholder="e.g. 57" onChange={(e) => setPresent(digits(e.target.value))}
                  autoFocus={loaded.workingDays !== null} />
              </label>
            </div>
            {daysOk && present !== '' && presentOk && <div className="an-muted">Attendance: <strong>{Math.round((p / d) * 1000) / 10}%</strong></div>}
            {!presentOk && <div className="an-muted" style={{ color: '#dc2626' }}>Days present can't be more than the working days.</div>}
            {changesClass && <div className="alert alert-info" style={{ margin: 0 }}>ℹ️ Working days change for the whole class (now {loaded.workingDays}).</div>}
            {error && <div className="alert alert-error" style={{ margin: 0 }}>⚠ {error}</div>}
          </div>
        )}
        <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !loaded || !daysOk || !presentOk} onClick={save}>
            {busy ? <span className="spinner" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
