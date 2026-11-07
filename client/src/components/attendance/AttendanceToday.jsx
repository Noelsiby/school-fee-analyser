import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import './Attendance.css';
import '../analysis/Analysis.css';

/**
 * Today's attendance for every class (admin) or the class teacher's classes:
 * "✅ Marked: 38 present, 3 absent" or "⏳ Not marked yet". No time alerts.
 * compact: a short card for dashboards.
 */
export default function AttendanceToday({ compact = false, onOpen }) {
  const { apiCall } = useApi();
  const [date, setDate] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall(`/api/attendance/today${date ? `?date=${date}` : ''}`).then((d) => { setData(d); if (!date) setDate(d.date); }).catch((e) => setError(e.message));
  }, [apiCall, date]);

  if (error) return compact ? null : <div className="alert alert-error">⚠ {error}</div>;
  if (!data) return <div className="spinner spinner-dark" />;
  const closed = data.holiday || data.weeklyOff;
  const rows = compact ? data.classes.slice(0, 20) : data.classes;

  return (
    <div>
      <div className="an-head" style={{ marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>✅ Attendance: {data.dateLabel}</h3>
          {!closed && <p className="an-sub">{data.summary.marked} of {data.summary.classes} classes marked · {data.summary.present} present · {data.summary.absent} not present</p>}
        </div>
        {!compact && <input type="date" className="form-input" style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />}
        {compact && onOpen && <button className="btn btn-ghost btn-sm" onClick={onOpen}>Open attendance →</button>}
      </div>
      {closed ? <p className="an-muted">🏖️ {data.holiday ? `Holiday: ${data.holiday.name}` : 'Weekly off day'}</p> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Class</th><th>Status</th><th>Present</th><th>Not present</th>{data.mode !== 'daily' && <th>{data.mode === 'periods' ? 'Periods taken' : 'Sessions taken'}</th>}</tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong> <span className="an-muted">{c.students} students</span></td>
                <td>{c.marked ? <span className="badge badge-green">✅ Marked</span> : <span className="badge badge-gray">⏳ Not marked yet</span>}</td>
                <td>{c.present ?? '—'}</td>
                <td>{c.absent ? <span className="an-down">{c.absent}</span> : c.absent ?? '—'}</td>
                {data.mode !== 'daily' && <td>{c.slotsMarked}/{c.slotsTotal}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
