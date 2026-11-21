import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import { gradeFor, setGradeScale } from '../../utils/grades';
import './admin.css';
import './Grading.css';

/*
 * Admin → Grading. The school decides everything:
 *  - the total the grades are written for ("out of", e.g. 100 or 50)
 *  - each grade's range in marks: from … to …
 *  - points for each grade
 *  - which grades count as Pass (the lowest pass grade sets the pass mark)
 * Exams with another total are scaled: 22 out of 25 on a scale out of 50 counts as 44.
 * Used everywhere grades appear: results, report cards, WhatsApp and the app.
 */

const COLORS = ['#15803d', '#16a34a', '#65a30d', '#84cc16', '#ca8a04', '#ea580c', '#f97316', '#dc2626', '#b91c1c', '#991b1b'];
let uid = 0;
const newId = () => `g${++uid}`;

const toRows = (bands) => [...bands].sort((a, b) => b.from - a.from).map((b) => ({
  id: newId(), grade: b.grade, from: String(b.from), to: String(b.to), points: String(b.points), pass: b.pass !== false,
}));
const sortRows = (rows) => [...rows].sort((a, b) => (Number(b.from) || 0) - (Number(a.from) || 0));
const snapshot = (rows, outOf) => JSON.stringify({ outOf: String(outOf), rows: sortRows(rows).map(({ id, ...r }) => r) });
const isWhole = (v) => v !== '' && Number.isInteger(Number(v));

/** Problems in plain words (empty = ready to save). Rows must already be sorted high → low. */
function problemsOf(rows, outOf) {
  const out = [];
  const total = Number(outOf);
  if (!Number.isInteger(total) || total < 1 || total > 1000) return ['"Out of" must be a whole number from 1 to 1000.'];
  if (rows.length < 2) out.push('Keep at least 2 grades.');
  const names = new Set();
  rows.forEach((r, i) => {
    const g = r.grade.trim().toUpperCase() || `Grade ${i + 1}`;
    if (!r.grade.trim()) out.push('Every grade needs a name, like A1.');
    else if (names.has(g)) out.push(`Grade ${g} is listed twice.`);
    names.add(g);
    if (!isWhole(r.from) || !isWhole(r.to)) { out.push(`${g}: type whole numbers in "from" and "to".`); return; }
    const from = Number(r.from), to = Number(r.to);
    if (from < 0 || to > total) out.push(`${g}: marks must be between 0 and ${total}.`);
    if (from > to) out.push(`${g}: "from" (${from}) is bigger than "to" (${to}).`);
    if (i === 0 && to !== total) out.push(`The top grade (${g}) must go up to ${total}.`);
    if (i > 0) {
      const above = rows[i - 1];
      const ag = above.grade.trim().toUpperCase() || 'the grade above';
      if (isWhole(above.from)) {
        const af = Number(above.from);
        if (to >= af) out.push(`${ag} and ${g} overlap: ${g} goes up to ${to} but ${ag} starts at ${af}.`);
        else if (to < af - 1) out.push(`${to + 1 === af - 1 ? `Mark ${to + 1} has` : `Marks ${to + 1} to ${af - 1} have`} no grade (between ${g} and ${ag}).`);
      }
      if (r.pass && !above.pass) out.push(`${g} is Pass but the higher grade ${ag} is Fail.`);
    }
    const p = Number(r.points);
    if (r.points === '' || !Number.isFinite(p) || p < 0 || p > 100) out.push(`${g}: points must be a number from 0 to 100.`);
  });
  if (rows.length && isWhole(rows[rows.length - 1].from) && Number(rows[rows.length - 1].from) !== 0) {
    out.push(`The lowest grade (${rows[rows.length - 1].grade || 'last'}) must start at 0.`);
  }
  return [...new Set(out)];
}

export default function GradingPage() {
  const { apiCall } = useApi();
  const [rows, setRows] = useState([]);
  const [outOf, setOutOf] = useState('100');
  const [savedSnap, setSavedSnap] = useState('');
  const [writtenFor, setWrittenFor] = useState(100);   // the total the current ranges were typed for
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tryMarks, setTryMarks] = useState('44');
  const [tryMax, setTryMax] = useState('50');

  const loadFrom = (d) => {
    const r = toRows(d.bands);
    const o = String(d.outOf || d.bands[0]?.outOf || 100);
    setRows(r); setOutOf(o); setWrittenFor(Number(o)); setSavedSnap(snapshot(r, o));
  };

  useEffect(() => {
    apiCall('/api/public/grade-scale')
      .then(loadFrom)
      .catch((e) => setError(e.message || 'Failed to load the grading.'))
      .finally(() => setLoading(false));
  }, [apiCall]);

  const sorted = useMemo(() => sortRows(rows), [rows]);
  const problems = useMemo(() => problemsOf(sorted, outOf), [sorted, outOf]);
  const total = Number(outOf);
  const dirty = snapshot(rows, outOf) !== savedSnap;
  const scale = problems.length ? null : sorted.map((r) => ({
    grade: r.grade.trim().toUpperCase(), from: Number(r.from), to: Number(r.to), points: Number(r.points), pass: r.pass,
    outOf: total, min: (Number(r.from) / total) * 100,
  }));
  const lowestPass = scale ? [...scale].reverse().find((b) => b.pass) : null;
  const totalChanged = Number.isInteger(total) && total > 0 && total !== writtenFor;

  const edit = (id, field, value) => { setNotice(''); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r))); };
  const tidy = () => setRows((rs) => sortRows(rs));
  const remove = (id) => { setNotice(''); setRows((rs) => rs.filter((r) => r.id !== id)); };
  const add = () => { setNotice(''); setRows((rs) => [...sortRows(rs), { id: newId(), grade: '', from: '', to: '', points: '0', pass: false }]); };

  // The total changed (e.g. 100 → 50): rescale every range to the new total, keeping them joined up
  const rescale = () => {
    const k = total / writtenFor;
    setRows((rs) => {
      const s = sortRows(rs).map((r) => ({ ...r, from: String(Math.round(Number(r.from) * k)) }));
      return s.map((r, i) => ({ ...r, from: i === s.length - 1 ? '0' : r.from, to: String(i === 0 ? total : Number(s[i - 1].from) - 1) }));
    });
    setWrittenFor(total);
    setNotice(`Ranges changed to "out of ${total}". Check them, then click Save.`);
  };

  const undo = () => {
    const s = JSON.parse(savedSnap);
    setRows(s.rows.map((r) => ({ ...r, id: newId() }))); setOutOf(s.outOf); setWrittenFor(Number(s.outOf)); setError(''); setNotice('');
  };

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const d = await apiCall('/api/admin/grade-scale', {
        method: 'PUT',
        body: { outOf: total, bands: sorted.map((r) => ({ grade: r.grade.trim().toUpperCase(), from: Number(r.from), to: Number(r.to), points: Number(r.points), pass: r.pass })) },
      });
      loadFrom(d);
      setGradeScale(d.bands);
      setNotice('✅ Grading saved. Results, report cards and messages now use it.');
    } catch (e) { setError(e.message || 'Failed to save.'); }
    finally { setSaving(false); }
  };

  const tryPct = Number(tryMax) > 0 && tryMarks !== '' ? (Number(tryMarks) / Number(tryMax)) * 100 : null;
  const color = (i, n) => COLORS[Math.min(COLORS.length - 1, Math.round((i / Math.max(1, n - 1)) * (COLORS.length - 1)))];
  const pctOf = (m) => Math.round((m / total) * 1000) / 10;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🏅 Grading</h1>
          <p className="page-sub">Your school decides the grades: the total, each grade's marks, its points, and which grades pass.</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}

      {loading ? <div className="empty-state"><div className="spinner spinner-dark" /></div> : (
        <>
          <div className="data-card gr-card">
            <div className="gr-head">
              <div className="gr-outof">
                <span className="gr-h" style={{ margin: 0 }}>Grades are for marks out of</span>
                <input className="form-input gr-num gr-total" type="number" min="1" max="1000" value={outOf} aria-label="Out of"
                  onChange={(e) => { setNotice(''); setOutOf(e.target.value); }} />
              </div>
              {lowestPass && (
                <span className="badge badge-blue gr-passbadge">
                  Pass mark: {lowestPass.from} out of {total}{total !== 100 ? ` (${pctOf(lowestPass.from)}%)` : ''}
                </span>
              )}
            </div>
            <p className="page-sub" style={{ marginTop: 0 }}>
              An exam with a different total is scaled to this one: 22 out of 25 = 44 out of 50. Marks are rounded, so 44.5 counts as 45.
            </p>

            {totalChanged && (
              <div className="alert alert-info gr-rescale"><div>
                You changed the total from <strong>{writtenFor}</strong> to <strong>{total}</strong>.{' '}
                <button className="btn btn-primary btn-sm" onClick={rescale}>Change the ranges to out of {total}</button>{' '}
                or type the new ranges yourself.
              </div></div>
            )}

            {/* 0 → total bar */}
            {scale && (
              <div className="gr-bar" aria-hidden="true">
                {[...scale].reverse().map((b, k, arr) => (
                  <div key={b.grade} style={{ flex: Math.max(1, b.to - b.from + 1), background: color(arr.length - 1 - k, arr.length) }} title={`${b.grade}: ${b.from}–${b.to}`}>
                    {b.grade}
                  </div>
                ))}
              </div>
            )}

            <div className="gr-table">
              <div className="gr-row gr-row-head">
                <span /><span>Grade</span><span>Marks (from – to)</span><span>Points</span><span>Result</span><span />
              </div>
              {rows.map((r) => {
                const i = sorted.findIndex((x) => x.id === r.id);
                return (
                  <div key={r.id} className="gr-row">
                    <span className="gr-dot" style={{ background: color(i, rows.length) }} />
                    <input className="form-input gr-grade" value={r.grade} maxLength={6} placeholder="A1" aria-label="Grade name"
                      onChange={(e) => edit(r.id, 'grade', e.target.value.toUpperCase())} />
                    <div className="gr-range">
                      <input className="form-input gr-num" type="number" min="0" value={r.from} placeholder="from" aria-label={`${r.grade} from`}
                        onChange={(e) => edit(r.id, 'from', e.target.value)} onBlur={tidy} />
                      <span>to</span>
                      <input className="form-input gr-num" type="number" min="0" value={r.to} placeholder="to" aria-label={`${r.grade} to`}
                        onChange={(e) => edit(r.id, 'to', e.target.value)} />
                      {total !== 100 && isWhole(r.from) && isWhole(r.to) && total > 0 && (
                        <span className="gr-pct">{pctOf(Number(r.from))}–{pctOf(Number(r.to))}%</span>
                      )}
                    </div>
                    <input className="form-input gr-num" type="number" min="0" max="100" step="0.5" value={r.points} aria-label={`${r.grade} points`}
                      onChange={(e) => edit(r.id, 'points', e.target.value)} />
                    <div className="gr-pf" role="group" aria-label={`${r.grade} pass or fail`}>
                      <button className={r.pass ? 'gr-pf-on gr-pass' : ''} onClick={() => edit(r.id, 'pass', true)}>Pass</button>
                      <button className={!r.pass ? 'gr-pf-on gr-fail' : ''} onClick={() => edit(r.id, 'pass', false)}>Fail</button>
                    </div>
                    <button className="btn btn-ghost btn-sm" disabled={rows.length <= 2} onClick={() => remove(r.id)} aria-label={`Remove grade ${r.grade}`} title="Remove this grade">✕</button>
                  </div>
                );
              })}
            </div>
            {rows.length < 15 && <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={add}>＋ Add a grade</button>}

            {problems.length > 0 && (
              <div className="alert alert-error" style={{ marginTop: 12 }}><div>
                {problems.map((p) => <div key={p}>⚠ {p}</div>)}
              </div></div>
            )}

            <div className="gr-actions">
              <div style={{ flex: 1 }} />
              {dirty && <button className="btn btn-ghost" onClick={undo}>Undo changes</button>}
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
                {tryPct === null || !scale ? '—' : (() => {
                  const g = gradeFor(tryPct, scale);
                  const b = scale.find((x) => x.grade === g);
                  return `${g} (${b.pass ? 'Pass' : 'Fail'})${Number(tryMax) !== total ? ` · counts as ${Math.round((tryPct / 100) * total * 10) / 10} out of ${total}` : ''}`;
                })()}
              </strong>
              {dirty && <span className="page-sub" style={{ margin: 0 }}>(with your changes, not saved yet)</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
