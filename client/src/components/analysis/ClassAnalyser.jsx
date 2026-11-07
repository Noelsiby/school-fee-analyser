import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { gradeTone } from '../../utils/grades';
import './Analysis.css';
import '../../pages/students/StudentProfile.css'; // name links (cr-link)

const signed = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n}%`);
const barTone = (pct, pass) => (pct === null ? '' : pct < pass ? 'weak' : pct < 60 ? 'mid' : '');

/**
 * Class Analyser: one class, one exam. Subject averages, toppers, most improved,
 * students needing attention, Class 10 board readiness, remedial groups, and a
 * comparison of two exams.
 * profileBase: '/admin/students' or '/class-teacher/students' (null = names not clickable)
 */
export default function ClassAnalyser({ classId, profileBase = null }) {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [exams, setExams]     = useState(null);
  const [examId, setExamId]   = useState('');
  const [data, setData]       = useState(null);
  const [compareId, setCompareId] = useState('');
  const [compare, setCompare] = useState(null);
  const [groups, setGroups]   = useState([]);
  const [error, setError]     = useState('');
  const [picked, setPicked]   = useState([]);
  const [groupForm, setGroupForm] = useState(null); // { name, subject }

  useEffect(() => {
    setExams(null); setData(null); setExamId('');
    apiCall(`/api/analysis/classes/${classId}/exams`)
      .then((d) => { setExams(d.exams); if (d.exams[0]) setExamId(String((d.exams.find((e) => e.finalized) || d.exams[0]).id)); })
      .catch((e) => setError(e.message));
  }, [apiCall, classId]);

  const loadGroups = useCallback(() => apiCall(`/api/analysis/classes/${classId}/remedial`).then((d) => setGroups(d.groups)).catch(() => {}), [apiCall, classId]);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (!examId) return;
    setData(null); setPicked([]); setCompare(null); setCompareId('');
    apiCall(`/api/analysis/classes/${classId}/exams/${examId}`).then(setData).catch((e) => setError(e.message));
  }, [apiCall, classId, examId]);

  useEffect(() => {
    if (!compareId || !examId) { setCompare(null); return; }
    apiCall(`/api/analysis/classes/${classId}/compare?a=${compareId}&b=${examId}`).then(setCompare).catch((e) => setError(e.message));
  }, [apiCall, classId, examId, compareId]);

  const nameCell = (s) => (profileBase
    ? <button className="cr-link" onClick={() => navigate(`${profileBase}/${s.id}`)}>{s.name}</button>
    : s.name);

  const createGroup = async (e) => {
    e.preventDefault();
    try {
      await apiCall(`/api/analysis/classes/${classId}/remedial`, { method: 'POST', body: { ...groupForm, studentIds: picked, examId: Number(examId) } });
      setGroupForm(null); setPicked([]);
      await loadGroups();
    } catch (err) { setError(err.message); }
  };
  const deleteGroup = async (id) => {
    if (!window.confirm('Delete this remedial group?')) return;
    try { await apiCall(`/api/analysis/remedial/${id}`, { method: 'DELETE' }); await loadGroups(); } catch (err) { setError(err.message); }
  };
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  if (error && !exams) return <div className="alert alert-error">⚠ {error}</div>;
  if (!exams) return <div className="spinner spinner-dark" />;
  if (!exams.length) return <p className="an-muted">No exams with results for this class yet.</p>;

  const examLabel = (e) => `${e.name}${e.deleted ? ' (deleted, results kept)' : e.finalized ? '' : ' (marks being entered)'}`;

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
      <div className="an-toolbar">
        <select className="form-select" value={examId} onChange={(e) => setExamId(e.target.value)} aria-label="Exam">
          {exams.map((e) => <option key={e.id} value={e.id}>{examLabel(e)}</option>)}
        </select>
        <select className="form-select" value={compareId} onChange={(e) => setCompareId(e.target.value)} aria-label="Compare with">
          <option value="">Compare with another exam…</option>
          {exams.filter((e) => String(e.id) !== examId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {!data ? <div className="spinner spinner-dark" /> : data.empty ? <p className="an-muted">No marks entered for this exam yet.</p> : (
        <>
          {!data.saved && <div className="alert alert-info" style={{ marginBottom: 12 }}>ℹ️ This exam isn't finalized yet, so these figures may still change.</div>}

          <div className="an-stats">
            <div className="an-stat"><strong>{data.summary.students}</strong><span>Students</span></div>
            <div className="an-stat"><strong>{data.summary.average ?? '—'}%</strong><span>Class average</span></div>
            <div className="an-stat"><strong>{data.summary.highest ?? '—'}%</strong><span>Highest</span></div>
            <div className="an-stat"><strong>{data.summary.passed}/{data.summary.complete}</strong><span>Passed (≥{data.passMark}%)</span></div>
            <div className="an-stat"><strong>{data.needsAttention.length}</strong><span>Need attention</span></div>
          </div>

          {compare && (
            <div className="an-box" style={{ marginBottom: 14 }}>
              <h4>{compare.examA} → {compare.examB}</h4>
              <p style={{ margin: '0 0 8px' }}>
                Class average <strong>{compare.classAverage.a}% → {compare.classAverage.b}%</strong>{' '}
                <span className={compare.classAverage.b >= compare.classAverage.a ? 'an-up' : 'an-down'}>({signed(Math.round((compare.classAverage.b - compare.classAverage.a) * 10) / 10)})</span>
                {' '}· {compare.improved} improved · {compare.dropped} dropped
              </p>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Subject</th><th>{compare.examA}</th><th>{compare.examB}</th><th>Change</th></tr></thead>
                  <tbody>{compare.subjects.map((s) => {
                    const d = s.a !== null && s.b !== null ? Math.round((s.b - s.a) * 10) / 10 : null;
                    return <tr key={s.name}><td>{s.name}</td><td>{s.a ?? '—'}%</td><td>{s.b ?? '—'}%</td><td className={d > 0 ? 'an-up' : d < 0 ? 'an-down' : ''}>{signed(d)}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            </div>
          )}

          <div className="an-box" style={{ marginBottom: 14 }}>
            <h4>Subjects</h4>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Subject</th><th>Class average</th><th></th><th>Highest</th><th>Lowest</th><th>Below pass</th></tr></thead>
                <tbody>
                  {[...data.subjects].sort((a, b) => (a.averagePct ?? 0) - (b.averagePct ?? 0)).map((s) => (
                    <tr key={s.name}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.average ?? '—'}/{s.maxMarks} ({s.averagePct ?? '—'}%)</td>
                      <td style={{ minWidth: 110 }}><div className={`an-bar ${barTone(s.averagePct, data.passMark)}`}><div style={{ width: `${s.averagePct ?? 0}%` }} /></div></td>
                      <td>{s.highest ?? '—'}</td>
                      <td>{s.lowest ?? '—'}</td>
                      <td>{s.belowPass ? <span className="badge badge-red">{s.belowPass}</span> : '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="an-muted" style={{ marginTop: 6 }}>Weakest subject first.</p>
          </div>

          <div className="an-grid2" style={{ marginBottom: 14 }}>
            <div className="an-box">
              <h4>🏆 Top 5</h4>
              <ol className="an-list" style={{ paddingLeft: 18, listStyle: 'decimal' }}>
                {data.top.map((s) => <li key={s.id}>{nameCell(s)} · {s.percentage}% <span className={`badge badge-${gradeTone(s.grade)}`}>{s.grade}</span></li>)}
              </ol>
            </div>
            <div className="an-box">
              <h4>📈 Most improved</h4>
              {data.improved.length === 0 ? <p className="an-muted">Needs an earlier exam to compare with.</p> : (
                <ul className="an-list">
                  {data.improved.map((s) => <li key={s.id}>{nameCell(s)} <span className="an-up">{signed(s.change)}</span> <span className="an-muted">since {s.previousExam}</span></li>)}
                </ul>
              )}
            </div>
          </div>

          <div className="an-box" style={{ marginBottom: 14 }}>
            <div className="an-head" style={{ marginBottom: 6 }}>
              <h4 style={{ margin: 0 }}>⚠ Needs attention ({data.needsAttention.length})</h4>
              {picked.length > 0 && !groupForm && (
                <button className="btn btn-primary btn-sm" onClick={() => setGroupForm({ name: '', subject: data.subjects[0]?.name || '' })}>
                  Make a remedial group ({picked.length})
                </button>
              )}
            </div>
            {groupForm && (
              <form onSubmit={createGroup} className="an-toolbar" style={{ background: '#f8fafc', padding: 10, borderRadius: 8 }}>
                <input className="form-input" style={{ maxWidth: 220 }} placeholder="Group name, e.g. Maths support" value={groupForm.name} maxLength={80}
                  onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} aria-label="Group name" />
                <select className="form-select" value={groupForm.subject} onChange={(e) => setGroupForm((f) => ({ ...f, subject: e.target.value }))} aria-label="Subject">
                  {data.subjects.map((s) => <option key={s.name}>{s.name}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" disabled={!groupForm.name.trim()}>Create group</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setGroupForm(null)}>Cancel</button>
              </form>
            )}
            {data.needsAttention.length === 0 ? <p className="an-muted">Nobody below the pass mark or dropping sharply. 🎉</p> : (
              <ul className="an-list">
                {data.needsAttention.map((s) => (
                  <li key={s.id}>
                    <label className="an-pick">
                      <input type="checkbox" checked={picked.includes(s.id)} onChange={() => togglePick(s.id)} aria-label={`Select ${s.name}`} />
                      <span><strong>{nameCell(s)}</strong> <span className="an-muted">Roll {s.rollNumber}</span> · {s.reasons.join(' · ')}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="an-muted" style={{ marginTop: 6 }}>Tick students to put them in a remedial group; the group shows whether they improve in the next exam.</p>
          </div>

          {data.board && (
            <div className="an-box" style={{ marginBottom: 14 }}>
              <h4>🎓 Board exam readiness</h4>
              <p className="an-muted" style={{ marginTop: 0 }}>Average of each subject over the last two exams. At risk = below the pass mark; Borderline = below 50%.</p>
              {data.board.length === 0 ? <p>Every student is above 50% in every subject. 🎉</p> : (
                <ul className="an-list">
                  {data.board.map((b) => (
                    <li key={b.id}>
                      <strong>{nameCell(b)}</strong>:{' '}
                      {b.risk.map((r) => <span key={r.subject} className={`badge ${r.level === 'At risk' ? 'badge-red' : 'badge-amber'}`} style={{ marginRight: 4 }}>{r.subject} {r.average}% · {r.level}</span>)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <div className="an-box">
        <h4>🧑‍🏫 Remedial groups</h4>
        {groups.length === 0 ? <p className="an-muted">No groups yet. Tick students under “Needs attention” to make one.</p> : groups.map((g) => (
          <div key={g.id} style={{ marginBottom: 12 }}>
            <div className="an-head" style={{ marginBottom: 4 }}>
              <strong>{g.name} <span className="an-muted">· {g.subject} · {g.members.length} students</span></strong>
              <button className="btn btn-ghost btn-sm" onClick={() => deleteGroup(g.id)} aria-label={`Delete group ${g.name}`}>🗑️</button>
            </div>
            <ul className="an-list">
              {g.members.map((m) => (
                <li key={m.id}>
                  {nameCell(m)}: {m.baseline === null ? '—' : `${m.baseline}%`} at start
                  {m.change !== null
                    ? <> → {m.latest}% in {m.latestExam} <span className={m.change >= 0 ? 'an-up' : 'an-down'}>({signed(m.change)})</span></>
                    : <span className="an-muted"> · progress shows after the next exam</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
