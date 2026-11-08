import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { waLabel } from '../../utils/whatsappStatus';
import './Attendance.css';
import '../analysis/Analysis.css';

const STATUS = { A: { text: 'Absent', badge: 'badge-red' }, L: { text: 'Leave', badge: 'badge-blue' }, T: { text: 'Late', badge: 'badge-amber' } };

/**
 * Today's attendance for every class (admin) or the class teacher's classes:
 * "✅ Marked: 38 present, 3 absent" or "⏳ Not marked yet". No time alerts.
 * compact: a short card for dashboards.
 */
export default function AttendanceToday({ compact = false, onOpen, onEdit }) {
  const { apiCall } = useApi();
  const [date, setDate] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall(`/api/attendance/today${date ? `?date=${date}` : ''}`).then((d) => { setData(d); if (!date) setDate(d.date); }).catch((e) => setError(e.message));
  }, [apiCall, date]);

  // Admin: delete one class's attendance for the whole day
  const removeDay = async (c) => {
    if (!window.confirm(`Delete all attendance of ${c.name} on ${data.dateLabel}? It will show as "not marked" again. This can't be undone.`)) return;
    try {
      await apiCall(`/api/attendance/classes/${c.id}?date=${data.date}`, { method: 'DELETE' });
      const d = await apiCall(`/api/attendance/today?date=${data.date}`);
      setData(d);
    } catch (e) { setError(e.message); }
  };

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
                <td>
                  <strong>{c.name}</strong> <span className="an-muted">{c.students} students</span>
                  {onEdit && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => onEdit(c.id, data.date)}>{c.marked ? '✏️ Edit' : '✅ Take'}</button>
                      {c.marked && <button className="btn btn-danger btn-sm" onClick={() => removeDay(c)} aria-label={`Delete ${c.name} attendance`}>🗑️ Delete</button>}
                    </div>
                  )}
                </td>
                <td>{c.marked ? <span className="badge badge-green">✅ Marked</span> : <span className="badge badge-gray">⏳ Not marked yet</span>}</td>
                <td>{c.present ?? '—'}</td>
                <td>{c.absent ? <span className="an-down">{c.absent}</span> : c.absent ?? '—'}</td>
                {data.mode !== 'daily' && <td>{c.slotsMarked}/{c.slotsTotal}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Who is absent, on leave or late (full view only) */}
      {!compact && !closed && <NotPresent data={data} />}
    </div>
  );
}

/** Names of students absent, on leave or late that day, class by class. */
function NotPresent({ data }) {
  const withNames = data.classes.filter((c) => c.notPresent?.length);
  const count = (st) => data.classes.reduce((m, c) => m + (c.notPresent || []).filter((x) => x.status === st).length, 0);
  const informed = (s) => {
    if (s.alert) {
      const l = waLabel(s.alert);
      return l ? <span className={`badge badge-${l.tone}`}>{l.icon} {l.text}</span> : s.alert;
    }
    if (s.status !== 'A') return <span className="an-muted">—</span>;
    return s.hasPhone ? <span className="an-muted">Not yet</span> : <span className="badge badge-red">No number</span>;
  };
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ margin: '0 0 4px' }}>Absent, on leave or late</h3>
      <p className="an-sub" style={{ marginBottom: 10 }}>{count('A')} absent · {count('L')} on leave · {count('T')} late</p>
      {withNames.length === 0 ? <p className="an-muted">Nobody, in the classes marked so far. 🎉</p> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Class</th><th>Roll</th><th>Student</th><th>Status</th><th>Reason</th>{data.mode !== 'daily' && <th>Missed</th>}<th>Parent informed</th></tr>
            </thead>
            <tbody>
              {withNames.flatMap((c) => c.notPresent.map((s, i) => (
                <tr key={`${c.id}-${s.id}`}>
                  <td>{i === 0 ? <strong>{c.name}</strong> : ''}</td>
                  <td>{s.rollNumber}</td>
                  <td>{s.name}</td>
                  <td><span className={`badge ${STATUS[s.status].badge}`}>{STATUS[s.status].text}</span></td>
                  <td>{s.reason || <span className="an-muted">—</span>}</td>
                  {data.mode !== 'daily' && <td>{s.slots.length ? s.slots.join(', ') : '—'}</td>}
                  <td>{informed(s)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
      <p className="an-muted" style={{ marginTop: 6 }}>To message parents, open “Take attendance” for that class and use “Inform parents”.</p>
    </div>
  );
}
