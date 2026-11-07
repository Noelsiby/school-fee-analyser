import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { gradeTone } from '../../utils/grades';
import { byClassName } from '../../components/SubjectFields';
import './admin.css';
import '../students/StudentProfile.css';
import '../../components/analysis/Analysis.css';

const QUESTIONS = [
  { key: 'top',      label: 'Top students' },
  { key: 'below',    label: 'Students below the pass mark' },
  { key: 'subjects', label: 'Subject averages (weakest first)' },
  { key: 'improved', label: 'Most improved students' },
  { key: 'compare',  label: 'Compare two exams' },
];

const signed = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n}%`);

/**
 * Admin → Quick Answers: everyday questions answered instantly from the school's
 * own data, by choosing from lists. No AI and no cost.
 */
export default function QuickAnswersPage() {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [question, setQuestion] = useState('top');
  const [classId, setClassId] = useState('');
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [examB, setExamB] = useState('');
  const [count, setCount] = useState('5');
  const [subject, setSubject] = useState('');
  const [data, setData] = useState(null);
  const [compare, setCompare] = useState(null);
  const [compareFailed, setCompareFailed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall('/api/analysis/my-classes').then((d) => {
      const list = [...d.classes].sort(byClassName);
      setClasses(list);
      if (list[0]) setClassId(String(list[0].id));
    }).catch((e) => setError(e.message));
  }, [apiCall]);

  // A new class: load its exams (ignore answers that arrive after the class changed again)
  useEffect(() => {
    if (!classId) return;
    let stale = false;
    setExams(null); setExamId(''); setExamB(''); setData(null); setSubject(''); setError('');
    apiCall(`/api/analysis/classes/${classId}/exams`).then((d) => {
      if (stale) return;
      setExams(d.exams);
      if (d.exams[0]) setExamId(String(d.exams[0].id));
      if (d.exams[1]) setExamB(String(d.exams[1].id));
    }).catch((e) => { if (!stale) { setExams([]); setError(e.message); } });
    return () => { stale = true; };
  }, [apiCall, classId]);

  useEffect(() => {
    if (!classId || !examId) return;
    let stale = false;
    setData(null);
    apiCall(`/api/analysis/classes/${classId}/exams/${examId}`)
      .then((d) => { if (!stale) setData(d); })
      .catch((e) => { if (!stale) { setData({ empty: true }); setError(e.message); } });
    return () => { stale = true; };
  }, [apiCall, classId, examId]);

  useEffect(() => {
    setCompare(null); setCompareFailed(false);
    if (question !== 'compare' || !examId || !examB || examId === examB) return;
    let stale = false;
    apiCall(`/api/analysis/classes/${classId}/compare?a=${examB}&b=${examId}`)
      .then((d) => { if (!stale) setCompare(d); })
      .catch((e) => { if (!stale) { setCompareFailed(true); setError(e.message); } });
    return () => { stale = true; };
  }, [apiCall, question, classId, examId, examB]);

  // Clear an old error when the question changes; drop a subject filter the exam doesn't have
  useEffect(() => { setError(''); }, [question]);
  useEffect(() => {
    if (subject && data && !data.empty && !data.subjects.some((s) => s.name === subject)) setSubject('');
  }, [data, subject]);

  const name = (s) => <button className="cr-link" onClick={() => navigate(`/admin/students/${s.id}`)}>{s.name}</button>;

  const answer = useMemo(() => {
    if (!data || data.empty) return null;
    const complete = data.students.filter((s) => s.complete && s.percentage !== null);
    if (question === 'top') {
      return { title: `Top ${count} in ${data.className}, ${data.examName}`, rows: [...complete].sort((a, b) => b.percentage - a.percentage).slice(0, Number(count)) };
    }
    if (question === 'below') {
      const rows = data.students.filter((s) => (subject
        ? s.failed.includes(subject)
        : (s.complete && Math.round(s.percentage) < data.passMark) || s.failed.length));
      return { title: `Below the pass mark (${data.passMark}%)${subject ? ` in ${subject}` : ''}: ${rows.length} student${rows.length === 1 ? '' : 's'}`, rows, showFailed: true };
    }
    if (question === 'improved') {
      // Only students who actually improved (an empty list just means nobody went up)
      const rows = complete.filter((s) => s.change !== null && s.change > 0).sort((a, b) => b.change - a.change).slice(0, Number(count));
      const comparable = complete.some((s) => s.change !== null);
      return {
        title: `Most improved in ${data.className}, ${data.examName}`,
        rows,
        showChange: true,
        empty: comparable ? 'Nobody improved since their previous exam.' : 'No earlier exam to compare with yet.',
      };
    }
    return null;
  }, [data, question, count, subject]);

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quick Answers</h1>
          <p className="page-sub">Choose a question, a class and an exam. Answers come straight from the school's results.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      <div className="data-card an-card">
        <div className="an-toolbar">
          <select className="form-select" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Question">
            {QUESTIONS.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
          </select>
          {(question === 'top' || question === 'improved') && (
            <select className="form-select" style={{ minWidth: 90 }} value={count} onChange={(e) => setCount(e.target.value)} aria-label="How many">
              {['3', '5', '10', '20'].map((n) => <option key={n} value={n}>Top {n}</option>)}
            </select>
          )}
          <span className="an-muted">in</span>
          <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="an-muted">{question === 'compare' ? 'exam' : 'for'}</span>
          <select className="form-select" value={examId} onChange={(e) => setExamId(e.target.value)} aria-label="Exam" disabled={!exams?.length}>
            {!exams?.length && <option>{exams ? 'No exams' : 'Loading…'}</option>}
            {(exams || []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.deleted ? ' (deleted)' : ''}</option>)}
          </select>
          {question === 'compare' && (
            <>
              <span className="an-muted">vs</span>
              <select className="form-select" value={examB} onChange={(e) => setExamB(e.target.value)} aria-label="Compare with">
                {(exams || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </>
          )}
          {question === 'below' && data && !data.empty && (
            <select className="form-select" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
              <option value="">Any subject or overall</option>
              {data.subjects.map((s) => <option key={s.name}>{s.name}</option>)}
            </select>
          )}
        </div>

        {!exams ? <div className="spinner spinner-dark" />
          : !exams.length ? <p className="an-muted">No exams with results for this class yet.</p>
          : !data ? <div className="spinner spinner-dark" />
          : data.empty ? <p className="an-muted">No marks entered for this exam yet.</p>
          : question === 'subjects' ? (
            <>
              <h3 style={{ marginTop: 0 }}>Subject averages: {data.className}, {data.examName}</h3>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Subject</th><th>Average</th><th></th><th>Highest</th><th>Below pass</th></tr></thead>
                  <tbody>{[...data.subjects].sort((a, b) => (a.averagePct ?? 0) - (b.averagePct ?? 0)).map((s) => (
                    <tr key={s.name}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.averagePct ?? '—'}%</td>
                      <td style={{ minWidth: 120 }}><div className={`an-bar ${s.averagePct < data.passMark ? 'weak' : s.averagePct < 60 ? 'mid' : ''}`}><div style={{ width: `${s.averagePct ?? 0}%` }} /></div></td>
                      <td>{s.highest}/{s.maxMarks}</td>
                      <td>{s.belowPass}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          ) : question === 'compare' ? (
            exams.length < 2 ? <p className="an-muted">This class has only one exam so far, so there's nothing to compare yet.</p>
              : examId === examB ? <p className="an-muted">Choose two different exams.</p>
              : compareFailed ? <p className="an-muted">Couldn't compare these exams.</p>
              : !compare ? <div className="spinner spinner-dark" /> : (
              <>
                <h3 style={{ marginTop: 0 }}>{compare.examA} → {compare.examB}</h3>
                <p>Class average {compare.classAverage.a}% → {compare.classAverage.b}% · <span className="an-up">{compare.improved} improved</span> · <span className="an-down">{compare.dropped} dropped</span></p>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Student</th><th>{compare.examA}</th><th>{compare.examB}</th><th>Change</th></tr></thead>
                    <tbody>{compare.students.map((s) => (
                      <tr key={s.id}><td>{name(s)}</td><td>{s.from}%</td><td>{s.to}%</td><td className={s.change > 0 ? 'an-up' : s.change < 0 ? 'an-down' : ''}>{signed(s.change)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )
          ) : answer && (
            <>
              <h3 style={{ marginTop: 0 }}>{answer.title}</h3>
              {answer.rows.length === 0 ? <p>{answer.empty || 'Nobody. 🎉'}</p> : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Student</th><th>Roll</th><th>%</th><th>Grade</th>{answer.showChange && <th>Change</th>}{answer.showFailed && <th>Below pass in</th>}</tr></thead>
                    <tbody>{answer.rows.map((s, i) => (
                      <tr key={s.id}>
                        <td>{question === 'top' ? s.rank ?? i + 1 : i + 1}</td>
                        <td>{name(s)}</td>
                        <td>{s.rollNumber}</td>
                        <td>{s.percentage ?? '—'}{s.percentage !== null && '%'}</td>
                        <td>{s.grade ? <span className={`badge badge-${gradeTone(s.grade)}`}>{s.grade}</span> : '—'}</td>
                        {answer.showChange && <td className="an-up">{signed(s.change)} <span className="an-muted">since {s.previousExam}</span></td>}
                        {answer.showFailed && <td>{s.failed.join(', ') || 'Overall'}</td>}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}
