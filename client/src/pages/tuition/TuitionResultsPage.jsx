import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { gradeTone } from '../../utils/grades';
import '../admin/admin.css';
import './Tuition.css';

/**
 * Tuition → Exam results: after each school exam, the marks of tuition students only,
 * grouped by tuition class. Click a name for the student's full report.
 */
export default function TuitionResultsPage() {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [exams, setExams] = useState(null);
  const [examId, setExamId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall('/api/tuition/exams').then((d) => { setExams(d.exams); if (d.exams[0]) setExamId(String(d.exams[0].id)); }).catch((e) => setError(e.message));
  }, [apiCall]);
  useEffect(() => {
    if (!examId) return;
    setData(null);
    apiCall(`/api/tuition/exams/${examId}/results`).then(setData).catch((e) => setError(e.message));
  }, [apiCall, examId]);

  const groups = useMemo(() => {
    if (!data) return [];
    const by = new Map();
    data.students.forEach((s) => { if (!by.has(s.tuitionClass)) by.set(s.tuitionClass, []); by.get(s.tuitionClass).push(s); });
    return [...by.entries()];
  }, [data]);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📈 Exam results</h1>
          <p className="page-sub">School exam marks of your tuition students only. Click a name for the full report.</p>
        </div>
        {exams?.length > 0 && (
          <select className="form-select" style={{ maxWidth: 260 }} value={examId} onChange={(e) => setExamId(e.target.value)} aria-label="Exam">
            {exams.map((e) => <option key={e.id} value={e.id}>{e.name}{e.status === 'Open' ? ' (marks still coming)' : ''}</option>)}
          </select>
        )}
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {!exams ? <div className="spinner spinner-dark" /> : exams.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
          <p className="empty-state-icon">📈</p>
          <p className="empty-state-text">No school exams yet for your tuition students.</p>
        </div></div>
      ) : !data ? <div className="spinner spinner-dark" /> : (
        <>
          <div className="tu-stats">
            <div className="tu-stat"><strong>{data.summary.students}</strong><span>Tuition students in this exam</span></div>
            <div className="tu-stat"><strong>{data.summary.average ?? '—'}{data.summary.average !== null ? '%' : ''}</strong><span>Average</span></div>
            <div className={`tu-stat ${data.summary.belowPass ? 'tu-warn' : 'tu-good'}`}><strong>{data.summary.belowPass}</strong><span>Below pass ({data.passMark}%)</span></div>
          </div>
          {data.exam.status === 'Open' && <div className="alert alert-info" style={{ marginBottom: 12 }}><div>ℹ️ Teachers are still entering marks for this exam; some marks may be missing.</div></div>}

          {groups.map(([cls, list]) => {
            const subjects = [...new Set(list.flatMap((s) => s.subjects.map((x) => x.name)))];
            return (
              <section key={cls} className="tu-group">
                <h3>🏫 {cls} <span>{list.length} student{list.length === 1 ? '' : 's'}</span></h3>
                <div className="data-card" style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr>
                        <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2 }}>Student</th>
                        {subjects.map((n) => <th key={n} style={{ textAlign: 'center' }}>{n}</th>)}
                        <th style={{ textAlign: 'center' }}>Total</th>
                        <th style={{ textAlign: 'center' }}>%</th>
                        <th style={{ textAlign: 'center' }}>Grade</th>
                        <th style={{ textAlign: 'center' }}>Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((s) => (
                        <tr key={s.tuitionStudentId}>
                          <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                            <button className="link-btn" onClick={() => navigate(`/tuition/students/${s.tuitionStudentId}`)}>{s.name}</button>
                            <div className="tu-muted" style={{ fontSize: '0.75rem' }}>School: {s.schoolClass}</div>
                          </td>
                          {subjects.map((n) => {
                            const x = s.subjects.find((y) => y.name === n);
                            const low = x && x.total !== null && x.maxMarks && Math.round((x.total / x.maxMarks) * 100) < data.passMark;
                            return (
                              <td key={n} style={{ textAlign: 'center', color: low ? '#dc2626' : undefined, fontWeight: low ? 700 : undefined }}>
                                {!x ? '' : x.absent ? 'AB' : x.total === null ? '—' : <>{x.total}<small className="tu-muted">/{x.maxMarks}</small></>}
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.total ?? '—'}{s.maxTotal ? <small className="tu-muted">/{s.maxTotal}</small> : ''}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{s.percentage !== null ? `${s.percentage}%` : '—'}</td>
                          <td style={{ textAlign: 'center' }}>{s.grade ? <span className={`badge badge-${gradeTone(s.grade)}`}>{s.grade}</span> : '—'}</td>
                          <td style={{ textAlign: 'center' }}>{s.rank ? `${s.rank} of ${s.rankedCount}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
