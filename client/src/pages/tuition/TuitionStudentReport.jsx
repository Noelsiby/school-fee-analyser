import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import LineChart from '../../components/analysis/LineChart';
import { gradeTone } from '../../utils/grades';
import { formatPhone } from '../../utils/whatsappStatus';
import { rupees, monthLabel } from './tuition';
import '../admin/admin.css';
import '../../components/analysis/Analysis.css';
import './Tuition.css';

/** Tuition → a tuition student's report: profile, every exam with all subject marks, progress, strengths, fees. */
export default function TuitionStudentReport() {
  const { id } = useParams();
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { apiCall(`/api/tuition/students/${id}/report`).then(setD).catch((e) => setError(e.message)); }, [apiCall, id]);

  if (error) return <div className="admin-page"><div className="alert alert-error">⚠ {error}</div></div>;
  if (!d) return <div className="admin-page"><div className="spinner spinner-dark" /></div>;
  const st = d.student;
  const done = d.exams.filter((e) => e.percentage !== null);
  const avg = done.length ? Math.round((done.reduce((n, e) => n + e.percentage, 0) / done.length) * 10) / 10 : null;
  const latest = done[done.length - 1];
  const strong = d.subjects.slice(0, 2);
  const weak = d.subjects.length > 2 ? d.subjects.slice(-2).reverse() : [];

  return (
    <div className="admin-page">
      <div className="detail-breadcrumb">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
      </div>

      <div className="data-card" style={{ padding: 18, marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="tu-avatar" style={{ width: 60, height: 60, fontSize: '1.5rem' }}>{st.name.charAt(0)}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="page-title" style={{ margin: 0 }}>{st.name}</h1>
          <p className="tu-muted">School: {st.schoolClass} · Roll {st.rollNumber}{st.classTeacher ? ` · Class teacher: ${st.classTeacher}` : ''}</p>
          <p className="tu-muted">Tuition: <strong>{st.tuitionClass}</strong> · {rupees(st.fee)}/month{st.fatherName ? ` · Father: ${st.fatherName}` : ''}{st.parentPhone ? ` · 📞 ${formatPhone(st.parentPhone)}` : ''}</p>
        </div>
      </div>

      <div className="tu-stats">
        <div className="tu-stat"><strong>{d.exams.length}</strong><span>Exams</span></div>
        <div className="tu-stat"><strong>{avg ?? '—'}{avg !== null ? '%' : ''}</strong><span>Average</span></div>
        <div className="tu-stat"><strong>{latest ? `${latest.percentage}%` : '—'}</strong><span>Latest · {latest?.examName || ''}</span></div>
        <div className={`tu-stat ${d.trend === null ? '' : d.trend >= 0 ? 'tu-good' : 'tu-warn'}`}>
          <strong>{d.trend === null ? '—' : `${d.trend >= 0 ? '▲' : '▼'} ${Math.abs(d.trend)}%`}</strong><span>Since the exam before</span>
        </div>
      </div>

      {done.length > 0 && (
        <div className="data-card an-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Progress</h3>
          <LineChart points={done.map((e) => ({ label: e.examName, value: e.percentage, classAverage: e.classAverage }))} passMark={d.passMark} />
          <p className="tu-muted">Solid line: {st.name}. Dashed: school class average. Red: pass mark.</p>
        </div>
      )}

      {(strong.length > 0 || weak.length > 0) && (
        <div className="tu-grid" style={{ marginBottom: 16 }}>
          <div className="tu-card" style={{ borderTopColor: '#16a34a' }}>
            <h3>💪 Strongest subjects</h3>
            {strong.map((s) => <p key={s.name} className="tu-muted"><strong>{s.name}</strong> · average {s.average}%</p>)}
          </div>
          {weak.length > 0 && (
            <div className="tu-card" style={{ borderTopColor: '#dc2626' }}>
              <h3>🎯 Needs more practice</h3>
              {weak.map((s) => <p key={s.name} className="tu-muted"><strong>{s.name}</strong> · average {s.average}%{s.average < d.passMark ? ' (below pass)' : ''}</p>)}
            </div>
          )}
        </div>
      )}

      <h3 style={{ margin: '0 0 10px' }}>All exams</h3>
      {d.exams.length === 0 ? <p className="tu-muted">No exam marks yet.</p> : [...d.exams].reverse().map((e) => (
        <div key={e.examId} className="data-card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <strong>{e.examName}{!e.finalized && <span className="badge badge-amber" style={{ marginLeft: 8 }}>marks still coming</span>}</strong>
            <span className="tu-muted">
              {e.total ?? '—'}{e.maxTotal ? `/${e.maxTotal}` : ''} · <strong>{e.percentage ?? '—'}{e.percentage !== null ? '%' : ''}</strong>
              {e.grade && <> · <span className={`badge badge-${gradeTone(e.grade)}`}>{e.grade}</span></>}
              {e.rank ? ` · Rank ${e.rank} of ${e.rankedCount}` : ''}
            </span>
          </div>
          <div className="tu-chips">
            {e.subjects.map((s) => {
              const low = s.total !== null && s.maxMarks && Math.round((s.total / s.maxMarks) * 100) < d.passMark;
              return (
                <span key={s.name} className="tu-chip" style={low ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#f1f5f9', color: '#334155' }}>
                  {s.name}: <strong>{s.absent ? 'AB' : s.total ?? '—'}</strong>{!s.absent && s.total !== null ? `/${s.maxMarks}` : ''}{s.grade && !s.absent ? ` (${s.grade})` : ''}
                </span>
              );
            })}
          </div>
        </div>
      ))}

      <h3 style={{ margin: '16px 0 10px' }}>Fees paid (last 12 months)</h3>
      {d.payments.length === 0 ? <p className="tu-muted">No payments recorded yet.</p> : (
        <div className="tu-chips">
          {d.payments.map((p) => <span key={p.month} className="tu-chip" style={{ background: '#dcfce7', color: '#166534' }}>{monthLabel(p.month)}: {rupees(p.amount)}{p.mode ? ` · ${p.mode}` : ''}</span>)}
        </div>
      )}
    </div>
  );
}
