import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';
import { gradeTone } from '../../utils/grades';
import LineChart from './LineChart';
import './Analysis.css';

const signed = (n, unit = '%') => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n}${unit}`);
const tone = (n) => (n === null || n === undefined ? '' : n > 0 ? 'an-up' : n < 0 ? 'an-down' : '');
const when = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * 📈 Performance section of a student's profile (Admin and Class Teacher).
 * Built from saved results, so it stays even if an exam is deleted.
 */
export default function PerformancePanel({ studentId }) {
  const { apiCall } = useApi();
  const [data, setData]     = useState(null);
  const [error, setError]   = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteSubject, setNoteSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(() => apiCall(`/api/analysis/students/${studentId}`)
    .then(setData).catch((e) => setError(e.message)), [apiCall, studentId]);
  useEffect(() => { load(); }, [load]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await apiCall(`/api/analysis/students/${studentId}/notes`, { method: 'POST', body: { text: noteText.trim(), subject: noteSubject || null } });
      setNoteText(''); setNoteSubject('');
      await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const deleteNote = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    try { await apiCall(`/api/analysis/notes/${id}`, { method: 'DELETE' }); await load(); } catch (err) { setError(err.message); }
  };

  const downloadSheet = async () => {
    setPdfBusy(true);
    try {
      const { downloadProgressSheet } = await import('./progressSheet');
      await downloadProgressSheet(data);
    } catch (err) { setError(err.message); } finally { setPdfBusy(false); }
  };

  if (error && !data) return <div className="alert alert-error">⚠ {error}</div>;
  if (!data) return <div className="data-card an-card"><div className="spinner spinner-dark" /></div>;

  const a = data.analysis;
  const points = a.exams.filter((e) => e.complete).map((e) => ({ label: e.examName, value: e.percentage, classAverage: e.classAverage }));

  return (
    <div className="data-card an-card">
      <div className="an-head">
        <div>
          <h3>📈 Performance</h3>
          <p className="an-sub">From every finalized exam. Kept even if an exam is deleted later.</p>
        </div>
        {a.exams.length > 0 && (
          <button className="btn btn-ghost btn-sm" disabled={pdfBusy} onClick={downloadSheet}>
            {pdfBusy ? <span className="spinner spinner-dark" /> : '⬇ Progress Sheet (PDF)'}
          </button>
        )}
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}

      {a.exams.length === 0 ? (
        <p className="an-muted">No finalized exams yet. The analysis appears here once a class teacher finalizes an exam.</p>
      ) : (
        <>
          {a.summary && <div className="an-summary">{a.summary}</div>}

          <div className="an-stats">
            <div className="an-stat"><strong>{a.latest ? `${a.latest.percentage}%` : '—'}</strong><span>Latest</span></div>
            <div className="an-stat"><strong>{a.latest?.grade || '—'}</strong><span>Grade</span></div>
            <div className="an-stat"><strong style={{ fontSize: '0.98rem' }}>{a.latest?.position || '—'}</strong><span>Class position</span></div>
            <div className="an-stat">
              <strong>{a.rankChange ? `${a.rankChange.from} → ${a.rankChange.to}` : (a.latest?.rank ?? '—')}</strong>
              <span>{a.rankChange ? (a.rankChange.to < a.rankChange.from ? 'Rank ⬆' : a.rankChange.to > a.rankChange.from ? 'Rank ⬇' : 'Rank') : 'Rank'}</span>
            </div>
            <div className="an-stat"><strong style={{ fontSize: '0.98rem' }}>{a.consistency?.label || '—'}</strong><span>Consistency</span></div>
            <div className="an-stat"><strong>{a.personalBest ? `${a.personalBest.percentage}%` : '—'}</strong><span>Personal best</span></div>
          </div>

          {points.length > 0 && (
            <div className="an-box" style={{ marginBottom: 14 }}>
              <LineChart points={points} passMark={a.passMark} />
              <div className="an-legend"><span><i />Student</span><span><i className="class" />Class average</span><span><i className="pass" />Pass mark</span></div>
            </div>
          )}

          {(a.flags.length > 0 || a.achievements.length > 0) && (
            <div className="an-grid2" style={{ marginBottom: 14 }}>
              {a.flags.length > 0 && (
                <div className="an-box"><h4>⚠ Needs attention</h4><div className="an-chips" style={{ flexDirection: 'column' }}>{a.flags.map((f, i) => <span key={i} className="an-flag">{f.text}</span>)}</div></div>
              )}
              {a.achievements.length > 0 && (
                <div className="an-box"><h4>🏅 Achievements</h4><div className="an-chips">{a.achievements.map((x, i) => <span key={i} className="an-badge">{x.icon} {x.text}</span>)}</div></div>
              )}
            </div>
          )}

          <div className="data-table-wrap" style={{ marginBottom: 14 }}>
            <table className="data-table">
              <thead>
                <tr><th>Subject</th><th>Average</th><th>Latest</th><th>Change</th><th>vs class</th><th>To reach the next grade</th></tr>
              </thead>
              <tbody>
                {a.subjects.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <strong>{s.name}</strong>
                      {a.strengths.includes(s.name) && <span className="badge badge-green" style={{ marginLeft: 6 }}>Strong</span>}
                      {a.weaknesses.includes(s.name) && <span className="badge badge-amber" style={{ marginLeft: 6 }}>Focus</span>}
                    </td>
                    <td>{s.average === null ? '—' : `${s.average}%`}</td>
                    <td>{s.latest ? <>{s.latest.total}/{s.latest.maxMarks} <span className={`badge badge-${gradeTone(s.latest.grade)}`}>{s.latest.grade}</span></> : '—'}</td>
                    <td className={tone(s.change)}>{signed(s.change)}</td>
                    <td className={tone(s.vsClass)}>{signed(s.vsClass)}</td>
                    <td>
                      {s.nextGrades.length === 0 ? <span className="an-muted">Top grade</span>
                        : s.nextGrades.map((g) => <div key={g.grade}>{g.marksNeeded === 0 ? `Just at ${g.grade}` : `+${g.marksNeeded} marks → ${g.grade}`}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {a.parts.length > 0 && (
            <div className="an-box" style={{ marginBottom: 14 }}>
              <h4>Reading · Writing · Dictation</h4>
              <ul className="an-list">
                {a.parts.map((p) => (
                  <li key={p.subject}>
                    <strong>{p.subject}:</strong>{' '}
                    {p.parts.map((x) => `${x.part === 'Main' ? 'Main paper' : x.part} ${x.average}%`).join(' · ')}
                    {p.weakest && <span className="an-down"> (weakest: {p.weakest})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Teacher notes with follow-up */}
      <div className="an-box an-notes">
        <h4>📝 Teacher notes</h4>
        <form onSubmit={addNote} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <select className="form-select" style={{ width: 'auto', minWidth: 140 }} value={noteSubject} onChange={(e) => setNoteSubject(e.target.value)} aria-label="Subject">
            <option value="">General</option>
            {a.subjects.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
          <textarea className="form-input" rows={2} maxLength={500} style={{ flex: 1, minWidth: 220 }} value={noteText}
            placeholder="e.g. Extra practice in multiplication tables; check again in the next exam"
            onChange={(e) => setNoteText(e.target.value)} aria-label="Note" />
          <button className="btn btn-primary btn-sm" disabled={saving || !noteText.trim()}>{saving ? <span className="spinner" /> : 'Add note'}</button>
        </form>
        {data.notes.length === 0 ? <p className="an-muted" style={{ marginTop: 8 }}>No notes yet. After each exam, write what the student should work on; the next exam shows whether it helped.</p> : data.notes.map((n) => (
          <div key={n.id} className="an-note">
            <div>{n.subject && <strong>{n.subject}: </strong>}{n.text}</div>
            <div className="an-note-meta">
              {n.authorName} · {when(n.createdAt)}{' '}
              <button type="button" className="cr-link" style={{ fontSize: '0.75rem' }} onClick={() => deleteNote(n.id)}>Delete</button>
            </div>
            {n.followUp
              ? <div className={`an-follow ${tone(n.followUp.change)}`}>Since this note: {n.subject || 'overall'} {n.followUp.from}% ({n.followUp.fromExam}) → {n.followUp.to}% ({n.followUp.toExam}), {signed(n.followUp.change)}</div>
              : <div className="an-follow an-muted">Follow-up appears after the next exam.</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
