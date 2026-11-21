import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import { DEFAULT_BANDS, gradeFor, setGradeScale } from '../../utils/grades';
import './admin.css';
import './Grading.css';

/*
 * Admin → Grading: which percentage gets which grade, and its points.
 * Used everywhere grades appear: results, report cards, WhatsApp and the app.
 * Simple to use: pick a ready-made scale, or change the "from %" of a grade;
 * the "to %" is worked out from the grade above, and the lowest grade always starts at 0%.
 */

const PRESETS = [
  { key: 'ap', name: 'AP State', note: 'A1–E, pass at 35%', bands: DEFAULT_BANDS },
  {
    key: 'cbse', name: 'CBSE style', note: 'A1–E, pass at 33%',
    bands: [
      { grade: 'A1', min: 91, points: 10 }, { grade: 'A2', min: 81, points: 9 }, { grade: 'B1', min: 71, points: 8 },
      { grade: 'B2', min: 61, points: 7 }, { grade: 'C1', min: 51, points: 6 }, { grade: 'C2', min: 41, points: 5 },
      { grade: 'D', min: 33, points: 4 }, { grade: 'E', min: 0, points: 0 },
    ],
  },
  {
    key: 'letters', name: 'Simple letters', note: 'A+ to F, pass at 35%',
    bands: [
      { grade: 'A+', min: 90, points: 10 }, { grade: 'A', min: 80, points: 9 }, { grade: 'B', min: 70, points: 8 },
      { grade: 'C', min: 60, points: 7 }, { grade: 'D', min: 50, points: 6 }, { grade: 'E', min: 35, points: 5 },
      { grade: 'F', min: 0, points: 0 },
    ],
  },
];

const COLORS = ['#15803d', '#16a34a', '#65a30d', '#84cc16', '#ca8a04', '#ea580c', '#f97316', '#dc2626', '#b91c1c', '#991b1b'];

const toRows = (bands) => [...bands].sort((a, b) => b.min - a.min).map((b, i) => ({ id: `${b.grade}-${i}-${Math.random()}`, grade: b.grade, min: String(b.min), points: String(b.points) }));
const toBands = (rows) => rows.map((r) => ({ grade: r.grade.trim().toUpperCase(), min: Number(r.min), points: Number(r.points) }));
const sortRows = (rows) => [...rows].sort((a, b) => (Number(b.min) || 0) - (Number(a.min) || 0));
const same = (a, b) => JSON.stringify(toBands(sortRows(a))) === JSON.stringify(toBands(sortRows(b)));

/** Problems with the rows, in plain words (empty = ready to save). */
function problemsOf(rows) {
  const out = [];
  if (rows.length < 2) out.push('Keep at least 2 grades.');
  const names = new Set();
  const mins = new Map();
  rows.forEach((r, i) => {
    const g = r.grade.trim().toUpperCase();
    const last = i === rows.length - 1;
    if (!g) out.push('Every grade needs a name, like A1.');
    else if (names.has(g)) out.push(`Grade ${g} is listed twice.`);
    names.add(g);
    const m = Number(r.min);
    if (!last && (r.min === '' || !Number.isInteger(m) || m < 1 || m > 100)) out.push(`${g || 'A grade'}: "from" must be a whole number from 1 to 100.`);
    else if (!last && mins.has(m)) out.push(`${mins.get(m)} and ${g} both start at ${m}%.`);
    mins.set(m, g);
    const p = Number(r.points);
    if (r.points === '' || !Number.isFinite(p) || p < 0 || p > 100) out.push(`${g || 'A grade'}: points must be a number from 0 to 100.`);
  });
  return [...new Set(out)];
}

export default function GradingPage() {
  const { apiCall } = useApi();
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tryMarks, setTryMarks] = useState('44');
  const [tryMax, setTryMax] = useState('50');
  const [outOf, setOutOf] = useState('100');   // show each grade as a marks range for an exam out of this

  useEffect(() => {
    apiCall('/api/public/grade-scale')
      .then((d) => { setRows(toRows(d.bands)); setSaved(toRows(d.bands)); })
      .catch((e) => setError(e.message || 'Failed to load the grading scale.'))
      .finally(() => setLoading(false));
  }, [apiCall]);

  // The lowest grade always starts at 0%
  const view = useMemo(() => rows.map((r, i) => (i === rows.length - 1 ? { ...r, min: '0' } : r)), [rows]);
  const problems = useMemo(() => problemsOf(view), [view]);
  const scale = problems.length ? null : toBands(view);
  const dirty = !same(view, saved);
  const passMark = scale && scale.length > 1 ? scale[scale.length - 2].min : null;
  // Fail line shown even while the scale has a mistake: where the grade above the last one starts
  const failBelow = view.length > 1 && view[view.length - 2].min !== '' ? Number(view[view.length - 2].min) : null;

  // Marks range of each grade for an exam out of `outOf` (exact: uses the same rounding as results)
  const total = Number(outOf);
  const marksRange = useMemo(() => {
    if (!scale || !(total > 0) || total > 1000) return null;
    const out = {};
    for (let m = 0; m <= total; m++) {
      const g = gradeFor((m / total) * 100, scale);
      if (!out[g]) out[g] = [m, m]; else out[g][1] = m;
    }
    return out;
  }, [scale, total]);

  const edit = (id, field, value) => { setNotice(''); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r))); };
  const tidy = () => setRows((rs) => sortRows(rs.map((r, i) => (i === rs.length - 1 ? { ...r, min: '0' } : r))));
  const remove = (id) => { setNotice(''); setRows((rs) => rs.filter((r) => r.id !== id)); };
  const addBelow = (i) => {
    setNotice('');
    setRows((rs) => {
      const hi = Number(rs[i].min) || 0;
      const lo = i + 1 < rs.length ? (i + 1 === rs.length - 1 ? 0 : Number(rs[i + 1].min) || 0) : 0;
      const mid = Math.max(lo + 1, Math.floor((hi + lo) / 2));
      const row = { id: `new-${Date.now()}`, grade: '', min: String(mid), points: rs[i + 1]?.points ?? '0' };
      return [...rs.slice(0, i + 1), row, ...rs.slice(i + 1)];
    });
  };
  const usePreset = (p) => { setError(''); setNotice(`"${p.name}" filled in. Check it, then click Save.`); setRows(toRows(p.bands)); };

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const d = await apiCall('/api/admin/grade-scale', { method: 'PUT', body: { bands: toBands(view) } });
      setRows(toRows(d.bands)); setSaved(toRows(d.bands));
      setGradeScale(d.bands);
      setNotice('✅ Grading saved. Results, report cards and messages now use it.');
    } catch (e) { setError(e.message || 'Failed to save.'); }
    finally { setSaving(false); }
  };

  const tryPct = Number(tryMax) > 0 && tryMarks !== '' ? (Number(tryMarks) / Number(tryMax)) * 100 : null;
  const color = (i) => COLORS[Math.min(COLORS.length - 1, Math.round((i / Math.max(1, view.length - 1)) * (COLORS.length - 1)))];

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🏅 Grading</h1>
          <p className="page-sub">
            Grades go by <strong>percentage</strong>, so one scale works for every exam: 44 out of 50 and 88 out of 100 are both 88%.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}

      {loading ? <div className="empty-state"><div className="spinner spinner-dark" /></div> : (
        <>
          {/* Ready-made scales */}
          <div className="data-card gr-card">
            <h3 className="gr-h">Start from a ready-made scale</h3>
            <div className="gr-presets">
              {PRESETS.map((p) => (
                <button key={p.key} className="gr-preset" onClick={() => usePreset(p)}>
                  <strong>{p.name}</strong><span>{p.note}</span>
                </button>
              ))}
            </div>
          </div>

          {/* The scale */}
          <div className="data-card gr-card">
            <div className="gr-head">
              <h3 className="gr-h" style={{ margin: 0 }}>Your grades</h3>
              <div className="gr-outof">
                <span>Show marks for an exam out of</span>
                {['100', '50', '25'].map((v) => (
                  <button key={v} className={`gr-pill${outOf === v ? ' gr-pill-on' : ''}`} onClick={() => setOutOf(v)}>{v}</button>
                ))}
                <input className="form-input gr-num" type="number" min="1" max="1000" value={outOf} aria-label="Exam out of"
                  onChange={(e) => setOutOf(e.target.value)} />
                {passMark !== null && <span className="badge badge-blue">Pass mark: {passMark}%{marksRange && marksRange[scale[scale.length - 2].grade] ? ` = ${marksRange[scale[scale.length - 2].grade][0]} of ${total}` : ''}</span>}
              </div>
            </div>

            {/* 0–100 bar */}
            {scale && (
              <div className="gr-bar" aria-hidden="true">
                {[...scale].reverse().map((b, k, arr) => {
                  const to = k === arr.length - 1 ? 100 : arr[k + 1].min - 1;
                  const i = scale.length - 1 - k;
                  return <div key={b.grade} style={{ flex: Math.max(1, to - b.min + 1), background: color(i) }} title={`${b.grade}: ${b.min}–${to}%`}>{b.grade}</div>;
                })}
              </div>
            )}

            <div className="gr-rows">
              {view.map((r, i) => {
                const last = i === view.length - 1;
                const to = i === 0 ? 100 : (Number(view[i - 1].min) || 0) - 1;
                return (
                  <div key={r.id}>
                    <div className="gr-row">
                      <span className="gr-dot" style={{ background: color(i) }} />
                      <input className="form-input gr-grade" value={r.grade} maxLength={6} placeholder="A1" aria-label="Grade name"
                        onChange={(e) => edit(r.id, 'grade', e.target.value.toUpperCase())} />
                      <div className="gr-range">
                        {last ? (
                          <span>Below <strong>{failBelow ?? '…'}%</strong></span>
                        ) : (
                          <>
                            <span>from</span>
                            <input className="form-input gr-num" type="number" min="1" max="100" value={r.min} aria-label={`${r.grade} starts at percent`}
                              onChange={(e) => edit(r.id, 'min', e.target.value)} onBlur={tidy} />
                            <span>% to <strong>{to >= 0 ? to : '…'}%</strong></span>
                          </>
                        )}
                        {marksRange && (
                          <span className="gr-marks">
                            = {marksRange[r.grade.trim().toUpperCase()]
                              ? `${marksRange[r.grade.trim().toUpperCase()][0]}–${marksRange[r.grade.trim().toUpperCase()][1]} marks out of ${total}`
                              : `no marks out of ${total}`}
                          </span>
                        )}
                      </div>
                      <label className="gr-points">
                        <input className="form-input gr-num" type="number" min="0" max="100" step="0.5" value={r.points} aria-label={`${r.grade} points`}
                          onChange={(e) => edit(r.id, 'points', e.target.value)} />
                        <span>points</span>
                      </label>
                      <span className={`badge ${last ? 'badge-red' : 'badge-green'} gr-pf`}>{last ? 'Fail' : 'Pass'}</span>
                      <button className="btn btn-ghost btn-sm" disabled={view.length <= 2} onClick={() => remove(r.id)} aria-label={`Remove grade ${r.grade}`} title="Remove this grade">✕</button>
                    </div>
                    {!last && view.length < 15 && (
                      <button className="gr-insert" onClick={() => addBelow(i)} title="Add a grade between these two">＋ add a grade here</button>
                    )}
                  </div>
                );
              })}
            </div>

            {problems.length > 0 && (
              <div className="alert alert-error" style={{ marginTop: 12 }}>
                {problems.map((p) => <div key={p}>⚠ {p}</div>)}
              </div>
            )}

            <div className="gr-actions">
              <span className="page-sub" style={{ margin: 0 }}>Percentages are rounded, so 87.5% counts as 88%.</span>
              <div style={{ flex: 1 }} />
              {dirty && <button className="btn btn-ghost" onClick={() => { setRows(saved); setError(''); setNotice(''); }}>Undo changes</button>}
              <button className="btn btn-primary" disabled={!dirty || saving || problems.length > 0} onClick={save}>
                {saving ? 'Saving…' : 'Save grading'}
              </button>
            </div>
          </div>

          {/* Try it */}
          <div className="data-card gr-card">
            <h3 className="gr-h">Try it</h3>
            <div className="gr-try">
              <input className="form-input gr-num" type="number" min="0" value={tryMarks} aria-label="Marks obtained" onChange={(e) => setTryMarks(e.target.value)} />
              <span>out of</span>
              <input className="form-input gr-num" type="number" min="1" value={tryMax} aria-label="Maximum marks" onChange={(e) => setTryMax(e.target.value)} />
              <span>=</span>
              <strong className="gr-result">
                {tryPct === null ? '—' : `${Math.round(tryPct * 100) / 100}%  →  ${scale ? gradeFor(tryPct, scale) : '…'}`}
              </strong>
              {dirty && <span className="page-sub" style={{ margin: 0 }}>(with your changes, not saved yet)</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
