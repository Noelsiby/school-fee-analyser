/**
 * Admin → Classes → Reports → "📅 Report card attendance".
 * Type the working days for this exam once, then each student's days present.
 * The report card shows Working days / Days present / Attendance %.
 */
import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../hooks/useApi';

export default function ReportAttendanceModal({ examId, cls, onClose, onSaved }) {
  const { apiCall } = useApi();
  const [data, setData] = useState(null);
  const [days, setDays] = useState('');
  const [present, setPresent] = useState({});   // studentId -> string
  const [bad, setBad] = useState([]);           // studentIds with a problem
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputs = useRef([]);

  useEffect(() => {
    apiCall(`/api/admin/report-attendance?examId=${examId}&classId=${cls.id}`)
      .then((d) => {
        setData(d);
        setDays(d.workingDays ?? '');
        setPresent(Object.fromEntries(d.students.map((s) => [s.id, s.present ?? ''])));
      })
      .catch((e) => setError(e.message));
  }, [apiCall, examId, cls.id]);

  const daysNum = Number(days);
  const daysOk = Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 366;
  const isBad = (id) => {
    const v = present[id];
    if (v === '' || v === null || v === undefined) return false;
    const n = Number(v);
    return !Number.isInteger(n) || n < 0 || (daysOk && n > daysNum) || bad.includes(id);
  };
  const filled = data ? data.students.filter((s) => present[s.id] !== '' && present[s.id] !== null).length : 0;

  const setOne = (id, v) => { setBad((b) => b.filter((x) => x !== id)); setPresent((p) => ({ ...p, [id]: v.replace(/\D/g, '').slice(0, 3) })); };
  const fillEmpty = () => setPresent((p) => Object.fromEntries(Object.entries(p).map(([id, v]) => [id, v === '' || v === null ? String(daysNum) : v])));
  // Enter jumps to the next student
  const onKey = (e, i) => { if (e.key === 'Enter') { e.preventDefault(); inputs.current[i + 1]?.focus(); inputs.current[i + 1]?.select(); } };

  const save = async (clear = false) => {
    if (clear && !window.confirm(`Remove the report card attendance of ${cls.name} for this exam?`)) return;
    setBusy(true); setError('');
    try {
      await apiCall('/api/admin/report-attendance', {
        method: 'PUT',
        body: clear ? { examId: Number(examId), classId: cls.id, workingDays: '' } : {
          examId: Number(examId), classId: cls.id, workingDays: days,
          records: data.students.map((s) => ({ studentId: s.id, present: present[s.id] })),
        },
      });
      onSaved(clear ? '✅ Report card attendance removed.' : `✅ Attendance saved: ${days} working days, ${filled} of ${data.students.length} students filled in.`);
    } catch (e) {
      setError(e.message);
      if (e.data?.studentIds) setBad(e.data.studentIds);
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2 className="modal-title">📅 Report card attendance</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!data ? (error ? <div className="alert alert-error">⚠ {error}</div> : <div className="spinner spinner-dark" />) : (
          <>
            <p className="tab-desc" style={{ marginTop: 0 }}>
              {cls.name} · {data.exam.name}. Shown on the report card as Working days / Days present / Attendance %.
              Leave a student empty to print a blank box for them.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span className="form-label" style={{ margin: 0 }}>Working days</span>
                <input className="form-input" style={{ width: 120, fontSize: '1.1rem', fontWeight: 700 }} inputMode="numeric" value={days}
                  onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 60" autoFocus />
              </label>
              <button className="btn btn-ghost btn-sm" disabled={!daysOk} onClick={fillEmpty}
                title="Puts the working days in every empty box; then change only the students who were absent">
                Fill empty boxes with {daysOk ? daysNum : '…'} (full attendance)
              </button>
            </div>

            <div className="data-table-wrap" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Roll</th><th>Student</th><th style={{ width: 130 }}>Days present</th><th>%</th></tr></thead>
                <tbody>
                  {data.students.map((s, i) => {
                    const v = present[s.id];
                    const pct = daysOk && v !== '' && v !== null && !isBad(s.id) ? Math.round((Number(v) / daysNum) * 1000) / 10 : null;
                    return (
                      <tr key={s.id}>
                        <td>{s.rollNumber}</td>
                        <td>{s.name}</td>
                        <td>
                          <input ref={(el) => { inputs.current[i] = el; }} className="form-input" inputMode="numeric" value={v ?? ''}
                            onChange={(e) => setOne(s.id, e.target.value)} onKeyDown={(e) => onKey(e, i)} aria-label={`Days present for ${s.name}`}
                            style={{ width: 90, padding: '4px 8px', ...(isBad(s.id) ? { borderColor: '#dc2626', background: '#fef2f2' } : {}) }} />
                        </td>
                        <td style={{ color: '#64748b' }}>{pct !== null ? `${pct}%` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {error && <div className="alert alert-error" style={{ marginTop: 10 }}>⚠ {error}</div>}
          </>
        )}

        <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" disabled={busy || !data || data.workingDays === null} onClick={() => save(true)}>Remove</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !data || !daysOk || data.students.some((s) => isBad(s.id))} onClick={() => save(false)}>
              {busy ? <span className="spinner" /> : 'Save attendance'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
