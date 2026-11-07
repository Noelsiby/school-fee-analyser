import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import './Analysis.css';
import '../../pages/students/StudentProfile.css';

/**
 * 📉 Subjects needing attention: for every class (admin) or the class teacher's class,
 * each subject in the latest exam with its average and the students below the pass
 * mark / below 50%. Worst subjects first; click a row to see the students.
 * profileBase: where student names link to ('/admin/students' or '/class-teacher/students').
 */
export default function SubjectWatch({ profileBase }) {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [cls, setCls] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [open, setOpen] = useState(null);

  useEffect(() => { apiCall('/api/analysis/subjects-overview').then(setData).catch(() => setData({ subjects: [] })); }, [apiCall]);
  if (!data) return <div className="data-card an-card"><div className="spinner spinner-dark" /></div>;
  if (!data.subjects.length) return null;

  const classes = [...new Set(data.subjects.map((s) => s.className))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const rows = data.subjects.filter((s) => (!cls || s.className === cls) && (!onlyProblems || s.belowPass.length || s.below50.length));
  const key = (s) => `${s.classId}|${s.subject}`;
  const name = (st) => (profileBase
    ? <button className="cr-link" onClick={() => navigate(`${profileBase}/${st.id}`)}>{st.name}</button>
    : st.name);

  return (
    <div className="data-card an-card">
      <div className="an-head">
        <div>
          <h3>📉 Subjects needing attention</h3>
          <p className="an-sub">
            Latest exam of each class. <strong>{data.totals.subjectsWithFails}</strong> subject{data.totals.subjectsWithFails === 1 ? '' : 's'} with students below the pass mark ({data.passMark}%) ·{' '}
            <strong>{data.totals.studentsBelowPass}</strong> student{data.totals.studentsBelowPass === 1 ? '' : 's'} affected.
          </p>
        </div>
        <div className="an-toolbar" style={{ marginBottom: 0 }}>
          {classes.length > 1 && (
            <select className="form-select" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class">
              <option value="">All classes</option>
              {classes.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
          <label className="an-pick"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Only subjects with weak students</label>
        </div>
      </div>

      {rows.length === 0 ? <p>No weak subjects. Every student is at 50% or above. 🎉</p> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Class</th><th>Subject</th><th>Exam</th><th>Average</th><th></th><th>Below pass</th><th>35–49%</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <Fragment key={key(s)}>
                  <tr>
                    <td><strong>{s.className}</strong></td>
                    <td><strong>{s.subject}</strong></td>
                    <td className="an-muted">{s.examName}{!s.finalized && ' (not finalized)'}</td>
                    <td>{s.average}%</td>
                    <td style={{ minWidth: 90 }}><div className={`an-bar ${s.average < data.passMark ? 'weak' : s.average < 60 ? 'mid' : ''}`}><div style={{ width: `${s.average}%` }} /></div></td>
                    <td>{s.belowPass.length ? <span className="badge badge-red">{s.belowPass.length} of {s.students}</span> : '0'}</td>
                    <td>{s.below50.length ? <span className="badge badge-amber">{s.below50.length}</span> : '0'}</td>
                    <td>
                      {(s.belowPass.length > 0 || s.below50.length > 0) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(open === key(s) ? null : key(s))}>
                          {open === key(s) ? 'Hide' : 'Students'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === key(s) && (
                    <tr>
                      <td colSpan={8} style={{ background: '#f8fafc' }}>
                        {s.belowPass.length > 0 && (
                          <p style={{ margin: '4px 0' }}>
                            <span className="an-down">Below pass mark:</span>{' '}
                            {s.belowPass.map((st, i) => <span key={st.id}>{name(st)} ({st.total}/{st.maxMarks}){i < s.belowPass.length - 1 ? ', ' : ''}</span>)}
                          </p>
                        )}
                        {s.below50.length > 0 && (
                          <p style={{ margin: '4px 0' }}>
                            <span style={{ color: '#b45309', fontWeight: 600 }}>35–49%:</span>{' '}
                            {s.below50.map((st, i) => <span key={st.id}>{name(st)} ({st.total}/{st.maxMarks}){i < s.below50.length - 1 ? ', ' : ''}</span>)}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
