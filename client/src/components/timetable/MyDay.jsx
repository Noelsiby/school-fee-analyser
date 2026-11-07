import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { TeacherWeek } from '../../pages/timetable/TimetablePage';
import '../attendance/Attendance.css';
import '../analysis/Analysis.css';

/**
 * "My periods today" for a teacher, from the timetable plus today's substitutions.
 * In every-period attendance mode each period links straight to its attendance.
 * attendancePath: '/class-teacher/attendance' or '/subject-teacher/attendance'
 */
export default function MyDay({ attendancePath }) {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [week, setWeek] = useState(null);
  const [showWeek, setShowWeek] = useState(false);

  useEffect(() => { apiCall('/api/timetable/my-day').then(setData).catch(() => {}); }, [apiCall]);
  useEffect(() => { if (showWeek && !week) apiCall('/api/timetable/teachers/me').then(setWeek).catch(() => {}); }, [apiCall, showWeek, week]);

  if (!data) return null;
  const closed = data.holiday || data.weeklyOff;

  return (
    <div className="data-card an-card">
      <div className="an-head">
        <div>
          <h3>🗓️ My periods today</h3>
          <p className="an-sub">{data.dateLabel}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowWeek((v) => !v)}>{showWeek ? 'Hide my week' : 'My week'}</button>
      </div>
      {closed ? <p className="an-muted">🏖️ {data.holiday ? `Holiday: ${data.holiday.name}` : 'Weekly off day'}</p>
        : data.periods.length === 0 ? <p className="an-muted">No periods for you today in the timetable.</p> : (
          <ul className="an-list">
            {data.periods.map((p) => (
              <li key={`${p.classId}-${p.periodKey}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ minWidth: 80 }}>{p.label}</strong>
                {p.start && <span className="an-muted">{p.start}{p.end ? `–${p.end}` : ''}</span>}
                <span>{p.className}{p.subject ? ` · ${p.subject}` : ''}</span>
                {p.covering && <span className="badge badge-blue">Substitute</span>}
                {p.substitute && <span className="badge badge-gray">Given to a substitute</span>}
                {data.mode === 'periods' && !p.substitute && (
                  p.attendanceMarked
                    ? <span className="badge badge-green">✅ Attendance taken</span>
                    : <button className="btn btn-primary btn-sm" onClick={() => navigate(`${attendancePath}?class=${p.classId}&date=${data.date}&slot=${p.periodKey}`)}>Take attendance</button>
                )}
              </li>
            ))}
          </ul>
        )}
      {showWeek && (week ? <div style={{ marginTop: 12 }}><TeacherWeek data={week} /></div> : <div className="spinner spinner-dark" />)}
    </div>
  );
}
