import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import AttendanceRegister from '../../components/attendance/AttendanceRegister';
import AttendanceToday from '../../components/attendance/AttendanceToday';
import AttendanceSettings from '../../components/attendance/AttendanceSettings';
import '../admin/admin.css';
import '../admin/ClassDetailPage.css';
import '../students/StudentProfile.css';

/** This month's attendance % for each student of the teacher's class. */
function MonthSummary() {
  const { apiCall } = useApi();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);
  useEffect(() => {
    apiCall('/api/attendance/classes').then((d) => {
      const own = d.classes.filter((c) => c.isClassTeacher);
      setClasses(own);
      if (own[0]) setClassId(String(own[0].id));
    }).catch(() => {});
  }, [apiCall]);
  useEffect(() => { if (classId) apiCall(`/api/attendance/classes/${classId}/summary`).then(setData).catch(() => {}); }, [apiCall, classId]);
  if (!classes.length) return <p className="an-muted">Only a class teacher has a monthly summary.</p>;
  return (
    <div>
      {classes.length > 1 && (
        <select className="form-select" style={{ width: 'auto', marginBottom: 10 }} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {!data ? <div className="spinner spinner-dark" /> : (
        <>
          <p className="an-muted">This month so far: attendance taken on {data.daysTaken} day{data.daysTaken === 1 ? '' : 's'}.</p>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Roll</th><th>Student</th><th>Present</th><th>%</th></tr></thead>
              <tbody>{data.students.map((s) => (
                <tr key={s.id}>
                  <td>{s.rollNumber}</td><td>{s.name}</td><td>{s.present}/{s.days}</td>
                  <td>{s.percent === null ? '—' : <span className={s.percent < 75 ? 'an-down' : ''}>{s.percent}%</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Attendance page.
 *   Admin: take attendance · today (all classes) · settings & holidays
 *   Class teacher: take attendance · this month
 *   Subject teacher: take attendance for their periods (every-period mode)
 * Links from "My periods today" open it at ?class=&date=&slot=.
 */
export default function AttendancePage({ role }) {
  const [params] = useSearchParams();
  const tabs = role === 'admin'
    ? [['today', '📋 Today, all classes'], ['take', '✅ Take attendance'], ['settings', '⚙️ Settings & holidays']]
    : role === 'class-teacher' ? [['take', '✅ Take attendance'], ['month', '📅 This month']] : [['take', '✅ Take attendance']];
  const [tab, setTab] = useState(role === 'admin' && !params.get('class') ? 'today' : 'take');

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-sub">Everyone starts as present: tap only the students who aren't, then save.</p>
        </div>
      </div>
      {tabs.length > 1 && (
        <div className="detail-tabs">
          {tabs.map(([k, label]) => <button key={k} className={`detail-tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
        </div>
      )}
      <div className="data-card" style={{ padding: 20 }}>
        {tab === 'take' && <AttendanceRegister initialClassId={params.get('class')} initialDate={params.get('date')} initialSlot={params.get('slot')} canInform={role === 'admin'} />}
        {tab === 'today' && <AttendanceToday />}
        {tab === 'settings' && <AttendanceSettings />}
        {tab === 'month' && <MonthSummary />}
      </div>
    </div>
  );
}
