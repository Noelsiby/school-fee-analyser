import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import './Attendance.css';
import '../analysis/Analysis.css';

const HEAD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shift = (month, by) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A student's attendance month by month, with this month's and this year's %. */
export default function AttendanceCalendar({ studentId }) {
  const { apiCall } = useApi();
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall(`/api/attendance/students/${studentId}${month ? `?month=${month}` : ''}`)
      .then((d) => { setData(d); if (!month) setMonth(d.month); })
      .catch((e) => setError(e.message));
  }, [apiCall, studentId, month]);

  if (error) return null; // no access or attendance not used: hide quietly
  if (!data) return <div className="data-card an-card"><div className="spinner spinner-dark" /></div>;
  const lead = data.days.length ? data.days[0].weekday : 0;
  const pct = (t) => (t.percent === null ? '—' : `${t.percent}%`);

  return (
    <div className="data-card an-card">
      <div className="an-head">
        <div>
          <h3>✅ Attendance</h3>
          <p className="an-sub">
            {monthName(data.month)}: <strong>{pct(data.monthTotal)}</strong> ({data.monthTotal.present} of {data.monthTotal.days} days) ·
            This year: <strong>{pct(data.yearTotal)}</strong> ({data.yearTotal.present} of {data.yearTotal.days} days)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shift(month, -1))} aria-label="Previous month">‹</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shift(month, 1))} aria-label="Next month">›</button>
        </div>
      </div>
      {data.yearTotal.days === 0 ? <p className="an-muted">No attendance taken yet.</p> : (
        <>
          <div className="at-cal">
            {HEAD.map((h) => <div key={h} className="at-cal-head">{h}</div>)}
            {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
            {data.days.map((d) => {
              const cls = d.holiday ? 'holiday' : d.state || (d.weeklyOff ? 'off' : '');
              const title = d.holiday || (d.state ? `${d.state}${d.reason ? `: ${d.reason}` : ''}` : d.weeklyOff ? 'Weekly off' : 'Not taken');
              return (
                <div key={d.date} className={`at-day ${cls}`} title={title}>
                  {Number(d.date.slice(8))}
                  {d.holiday && <small>{d.holiday}</small>}
                  {d.state === 'partial' && <small>{Object.entries(d.slots).filter(([, v]) => v === 'A').map(([k]) => k).join(' ')} absent</small>}
                </div>
              );
            })}
          </div>
          <div className="an-legend" style={{ marginTop: 8 }}>
            <span style={{ color: '#166534' }}>■ Present</span><span style={{ color: '#991b1b' }}>■ Absent</span>
            <span style={{ color: '#92400e' }}>■ Part of the day</span><span style={{ color: '#1e40af' }}>■ Leave</span><span>■ Holiday / off</span>
          </div>
        </>
      )}
    </div>
  );
}
