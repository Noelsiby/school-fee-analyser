import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import { DEFAULT_BANDS, gradeFor, rangeLabel, passMarkOf, setGradeScale } from '../../utils/grades';
import './admin.css';

const toRows = (bands) => bands.map(b => ({ grade: b.grade, min: String(b.min), points: String(b.points) }));
const toBands = (rows) => rows.map(r => ({ grade: r.grade, min: Number(r.min), points: Number(r.points) }));

/** A sorted, usable scale from the rows being edited (for the preview), or null while they're incomplete. */
function previewScale(rows) {
  if (!rows.length) return null;
  const bands = toBands(rows).filter(b => b.grade.trim() && Number.isFinite(b.min) && rows.every(r => r.min !== ''));
  if (bands.length !== rows.length) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted[sorted.length - 1].min === 0 ? sorted : null;
}

/**
 * Admin → Grading: the percentage cut-offs and points for each grade.
 * Used everywhere grades appear: results, progress reports, WhatsApp messages and the public page.
 */
export default function GradingPage() {
  const { apiCall } = useApi();
  const [rows, setRows]       = useState([]);
  const [saved, setSaved]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [notice, setNotice]   = useState('');
  const [tryMarks, setTryMarks] = useState('44');
  const [tryMax, setTryMax]     = useState('50');

  useEffect(() => {
    apiCall('/api/public/grade-scale')
      .then(d => { setRows(toRows(d.bands)); setSaved(toRows(d.bands)); })
      .catch(e => setError(e.message || 'Failed to load the grading scale.'))
      .finally(() => setLoading(false));
  }, [apiCall]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const scale = useMemo(() => previewScale(rows), [rows]);

  const update = (i, field, value) => {
    setNotice('');
    setRows(rs => rs.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  };
  const remove = (i) => { setNotice(''); setRows(rs => rs.filter((_, k) => k !== i)); };
  const add = () => { setNotice(''); setRows(rs => [...rs, { grade: '', min: '', points: '0' }]); };
  const reset = () => { setNotice(''); setError(''); setRows(toRows(DEFAULT_BANDS)); };

  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      const d = await apiCall('/api/admin/grade-scale', { method: 'PUT', body: { bands: toBands(rows) } });
      setRows(toRows(d.bands)); setSaved(toRows(d.bands));
      setGradeScale(d.bands);
      setNotice('Grading scale saved. Results, reports and WhatsApp messages now use it.');
    } catch (e) {
      setError(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // "Try it": marks out of any total → percentage → grade.
  const tryPct = Number(tryMax) > 0 && tryMarks !== '' ? (Number(tryMarks) / Number(tryMax)) * 100 : null;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Grading</h1>
          <p className="page-sub">
            Grades go by <strong>percentage</strong>, so the same scale works whether an exam is out of 100, 50 or 30.
            Example: 44 out of 50 = 88%, and 88 out of 100 = 88%. Both get the same grade.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}

      {loading ? <div className="empty-state"><div className="spinner spinner-dark" /></div> : (
        <>
          <div className="data-card" style={{ padding: 20, marginBottom: 16 }}>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Grade</th>
                    <th>From %</th>
                    <th>Range</th>
                    <th>Points</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const at = scale ? scale.findIndex(b => b.grade === r.grade && String(b.min) === r.min) : -1;
                    return (
                      <tr key={i}>
                        <td><input className="form-input" style={{ width: 80 }} value={r.grade} maxLength={6}
                          aria-label="Grade" placeholder="A1" onChange={e => update(i, 'grade', e.target.value.toUpperCase())} /></td>
                        <td><input className="form-input" style={{ width: 90 }} type="number" min="0" max="100" step="1"
                          aria-label={`${r.grade || 'Grade'} from percent`} value={r.min} onChange={e => update(i, 'min', e.target.value)} /></td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted, #64748b)' }}>{at >= 0 ? `${rangeLabel(scale, at)}%` : '—'}</td>
                        <td><input className="form-input" style={{ width: 80 }} type="number" min="0" max="100" step="0.5"
                          aria-label={`${r.grade || 'Grade'} points`} value={r.points} onChange={e => update(i, 'points', e.target.value)} /></td>
                        <td>
                          <button className="btn btn-danger btn-sm" disabled={rows.length <= 2} onClick={() => remove(i)}
                            aria-label={`Remove grade ${r.grade}`}>🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button className="btn btn-ghost" onClick={add}>+ Add grade</button>
              <button className="btn btn-ghost" onClick={reset}>↺ Reset to AP State scale</button>
              <div style={{ flex: 1 }} />
              {dirty && <button className="btn btn-ghost" onClick={() => { setRows(saved); setError(''); }}>Cancel changes</button>}
              <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
                {saving ? 'Saving…' : 'Save grading scale'}
              </button>
            </div>
            <p className="page-sub" style={{ marginTop: 10 }}>
              The lowest grade must start at 0% and counts as fail.
              {scale && <> Pass mark: <strong>{passMarkOf(scale)}%</strong>.</>}
              {' '}Percentages are rounded to whole numbers, so 87.5% counts as 88%.
            </p>
          </div>

          <div className="data-card" style={{ padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>Try it</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input className="form-input" style={{ width: 90 }} type="number" min="0" value={tryMarks}
                aria-label="Marks obtained" onChange={e => setTryMarks(e.target.value)} />
              <span>out of</span>
              <input className="form-input" style={{ width: 90 }} type="number" min="1" value={tryMax}
                aria-label="Maximum marks" onChange={e => setTryMax(e.target.value)} />
              <span>=</span>
              <strong>
                {tryPct === null ? '—' : `${Math.round(tryPct * 100) / 100}% → ${scale ? gradeFor(tryPct, scale) : '—'}`}
              </strong>
              {dirty && <span className="page-sub">(using the scale above, not saved yet)</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
