import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import './admin.css';
import '../students/StudentProfile.css';
import '../../components/analysis/Analysis.css';

/**
 * Admin → At-risk students: low marks and/or low attendance, so the school can act early.
 * "High" = both marks and attendance are a concern; "Watch" = one of them.
 */
export default function AtRiskPage() {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState('all');
  const [cls, setCls] = useState('');

  useEffect(() => { apiCall('/api/analysis/at-risk').then(setData).catch((e) => setError(e.message)); }, [apiCall]);

  const classes = useMemo(() => (data ? [...new Set(data.students.map((s) => s.className))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : []), [data]);
  const rows = data ? data.students.filter((s) => (level === 'all' || s.level === level) && (!cls || s.className === cls)) : [];

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">At-risk students</h1>
          <p className="page-sub">
            Students whose latest finalized result is below the pass mark, below it in two or more subjects, or dropped 10% or more,
            and/or whose attendance this year is under 75% (after at least 10 days).
          </p>
        </div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {!data ? <div className="spinner spinner-dark" /> : (
        <div className="data-card an-card">
          <div className="an-toolbar">
            <select className="form-select" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
              <option value="all">All ({data.students.length})</option>
              <option value="high">High: marks and attendance ({data.high})</option>
              <option value="watch">Watch: one concern ({data.students.length - data.high})</option>
            </select>
            <select className="form-select" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class">
              <option value="">All classes</option>
              {classes.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {rows.length === 0 ? <p>No students here. 🎉</p> : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Level</th><th>Student</th><th>Class</th><th>Latest result</th><th>Attendance</th><th>Why</th></tr></thead>
                <tbody>{rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.level === 'high' ? <span className="badge badge-red">High</span> : <span className="badge badge-amber">Watch</span>}</td>
                    <td><button className="cr-link" onClick={() => navigate(`/admin/students/${s.id}`)}>{s.name}</button> <span className="an-muted">Roll {s.rollNumber}</span></td>
                    <td>{s.className}</td>
                    <td>{s.latest ? `${s.latest.percentage}% (${s.latest.examName})` : '—'}</td>
                    <td>{s.attendance ? <span className={s.attendance.percent < 75 ? 'an-down' : ''}>{s.attendance.percent}%</span> : '—'}</td>
                    <td>{s.reasons.join(' · ')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
