import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import ClassAnalyser from '../../components/analysis/ClassAnalyser';
import '../admin/admin.css';
import '../../components/analysis/Analysis.css';

/**
 * Class Analyser page for teachers.
 * Class teachers see their own class(es); subject teachers see the classes they
 * teach, plus a list of students who need help in their subjects.
 */
export default function AnalyserPage({ role }) {
  const { apiCall } = useApi();
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState('');
  const [mine, setMine] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall('/api/analysis/my-classes')
      .then((d) => {
        const list = role === 'class-teacher' ? d.classes.filter((c) => c.isClassTeacher) : d.classes;
        setClasses(list);
        if (list[0]) setClassId(String(list[0].id));
      })
      .catch((e) => setError(e.message));
    if (role === 'subject-teacher') apiCall('/api/analysis/my-subjects').then(setMine).catch(() => {});
  }, [apiCall, role]);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Class Analyser</h1>
          <p className="page-sub">Subject averages, toppers, most improved, students who need attention and remedial groups.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      {mine && mine.subjects.length > 0 && (
        <div className="data-card an-card">
          <h3 style={{ marginTop: 0 }}>My subjects: students who need help</h3>
          <p className="an-sub" style={{ marginBottom: 10 }}>Below 50% in your subject in the latest exam of each class.</p>
          <div className="an-grid2">
            {mine.subjects.map((m) => (
              <div key={`${m.classId}-${m.subject}`} className="an-box">
                <h4>{m.className} · {m.subject}</h4>
                {!m.exam ? <p className="an-muted">No exam yet.</p> : (
                  <>
                    <p className="an-muted" style={{ marginTop: 0 }}>{m.exam} · class average {m.average ?? '—'}%</p>
                    {m.weak.length === 0 ? <p>Everyone is at 50% or above. 🎉</p> : (
                      <ul className="an-list">
                        {m.weak.map((w) => <li key={w.id}>{w.name} <span className="an-muted">Roll {w.rollNumber}</span> · {w.total}/{w.maxMarks} ({w.pct}%) {Math.round(w.pct) < mine.passMark && <span className="badge badge-red">Below pass</span>}</li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!classes ? <div className="spinner spinner-dark" /> : classes.length === 0 ? (
        <div className="data-card an-card"><p className="an-muted">You don't have a class yet.</p></div>
      ) : (
        <div className="data-card an-card">
          {classes.length > 1 && (
            <div className="an-toolbar">
              <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {classId && <ClassAnalyser key={classId} classId={Number(classId)} profileBase={role === 'class-teacher' ? '/class-teacher/students' : null} />}
        </div>
      )}
    </div>
  );
}
