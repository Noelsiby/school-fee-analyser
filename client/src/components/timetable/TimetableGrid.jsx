import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';
import '../attendance/Attendance.css';
import '../analysis/Analysis.css';
import '../../pages/students/StudentProfile.css'; // link style (cr-link)

const cellKey = (day, key) => `${day}|${key}`;

/**
 * One class's weekly timetable: days down the side, periods across the top.
 * Everyone sees it read-only. The admin (editable) gets:
 *   ✏️ Edit: choose subject + teacher per period, ✕ to clear a period, "Clear day", then Save / Cancel
 *   🗑️ Delete timetable: removes the whole timetable of this class (after confirming)
 * Choosing a subject fills in the teacher assigned to that subject in this class.
 */
export default function TimetableGrid({ classId, editable = false, onSaved }) {
  const { apiCall } = useApi();
  const [data, setData]   = useState(null);
  const [cells, setCells] = useState({});   // "day|P1" → { subjectId, teacherId }
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const d = await apiCall(`/api/timetable/classes/${classId}`);
    setData(d);
    setCells(Object.fromEntries(d.entries.map((e) => [cellKey(e.day, e.periodKey), { subjectId: e.subjectId || '', teacherId: e.teacherId || '' }])));
    setDirty(false);
  }, [apiCall, classId]);
  useEffect(() => { setData(null); setEditing(false); load().catch((e) => setError(e.message)); }, [load]);

  const setCell = (day, key, patch) => {
    setCells((c) => {
      const cur = c[cellKey(day, key)] || { subjectId: '', teacherId: '' };
      const next = { ...cur, ...patch };
      if ('subjectId' in patch) {
        const sub = data.subjects.find((s) => String(s.id) === String(patch.subjectId));
        next.teacherId = sub?.teacherIds?.[0] || (patch.subjectId ? cur.teacherId : '');
      }
      return { ...c, [cellKey(day, key)]: next };
    });
    setDirty(true); setNotice('');
  };
  const clearCell = (day, key) => {
    setCells((c) => { const n = { ...c }; delete n[cellKey(day, key)]; return n; });
    setDirty(true); setNotice('');
  };
  const clearDay = (day) => {
    setCells((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith(`${day}|`))));
    setDirty(true); setNotice('');
  };

  const put = async (entries) => {
    const d = await apiCall(`/api/timetable/classes/${classId}`, { method: 'PUT', body: { entries } });
    await load();
    onSaved?.();
    return d;
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const entries = Object.entries(cells)
        .filter(([, v]) => v.subjectId || v.teacherId)
        .map(([k, v]) => { const [day, periodKey] = k.split('|'); return { day: Number(day), periodKey, subjectId: v.subjectId || null, teacherId: v.teacherId || null }; });
      const d = await put(entries);
      setNotice(d.clashes.length ? `Saved, but ${d.clashes.length} clash${d.clashes.length === 1 ? '' : 'es'} found (shown in red).` : '✅ Timetable saved.');
      setEditing(false);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const cancel = async () => { await load().catch(() => {}); setEditing(false); setNotice(''); setError(''); };

  const deleteAll = async () => {
    if (!window.confirm(`Delete the whole timetable of ${data.className}? Every period of every day is cleared. This can't be undone.`)) return;
    setSaving(true); setError('');
    try {
      await put([]);
      setNotice('✅ Timetable deleted.');
      setEditing(false);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  if (error && !data) return <div className="alert alert-error">⚠ {error}</div>;
  if (!data) return <div className="spinner spinner-dark" />;
  if (!data.periods.length) {
    return <p className="an-muted">No periods are set for {data.className} yet. The admin sets the school's periods in Timetable → Periods.</p>;
  }

  // On a shorter day (e.g. Saturday: only the first 4 periods) later periods don't happen
  const happens = (day, key) => {
    const n = data.dayCounts?.[day];
    return !n || Number(String(key).replace(/[^0-9]/g, '')) <= n;
  };
  const breakHappens = (day, index) => {
    const n = data.dayCounts?.[day];
    if (!n) return true;
    return data.periods.slice(index + 1).some((p) => !p.isBreak && happens(day, p.key));
  };

  const subjectName = new Map(data.subjects.map((s) => [s.id, s.name]));
  const teacherName = new Map(data.teachers.map((t) => [t.id, t.name]));
  const clashAt = new Map(data.clashes.map((c) => [cellKey(c.day, c.periodKey), c]));
  const filled = Object.values(cells).filter((v) => v.subjectId || v.teacherId).length;
  const dayFilled = (day) => Object.entries(cells).some(([k, v]) => k.startsWith(`${day}|`) && (v.subjectId || v.teacherId));

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
      {notice && <div className={`alert ${notice.startsWith('✅') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 10 }}>{notice}</div>}
      {data.clashes.length > 0 && (
        <div className="alert alert-error" style={{ marginBottom: 10 }}>
          ⚠ Clashes:{' '}
          {data.clashes.map((c, i) => <span key={i}>{c.teacher} is in {c.classes.join(' and ')} on {c.dayName}, {data.periods.find((p) => p.key === c.periodKey)?.label}{i < data.clashes.length - 1 ? '; ' : '.'}</span>)}
        </div>
      )}

      {editable && (
        <div className="tt-actions no-print" style={{ marginTop: 0, marginBottom: 10 }}>
          {!editing ? (
            <>
              <button className="btn btn-primary" onClick={() => { setEditing(true); setNotice(''); }}>✏️ Edit timetable</button>
              {filled > 0 && <button className="btn btn-danger" disabled={saving} onClick={deleteAll}>🗑️ Delete timetable</button>}
              {filled === 0 && <span className="an-muted">This class has no timetable yet. Click Edit to fill it in.</span>}
            </>
          ) : (
            <>
              <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? <span className="spinner" /> : 'Save timetable'}</button>
              <button className="btn btn-ghost" disabled={saving} onClick={cancel}>Cancel</button>
              <span className="an-muted">Choose a subject (its teacher fills in), ✕ clears a period, “Clear day” clears a whole day.</span>
            </>
          )}
        </div>
      )}

      <div className="tt-wrap">
        <table className="tt-grid">
          <thead>
            <tr>
              <th style={{ width: 90 }}>{data.className}{data.scheduleName && <small>{data.scheduleName}</small>}</th>
              {data.periods.map((p) => <th key={p.key}>{p.label}{p.start && <small>{p.start}{p.end ? `–${p.end}` : ''}</small>}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.days.map((d) => (
              <tr key={d.day}>
                <td className="tt-day">
                  {d.name.slice(0, 3)}
                  {editing && dayFilled(d.day) && (
                    <div><button type="button" className="cr-link" style={{ fontSize: '0.72rem', fontWeight: 400 }} onClick={() => clearDay(d.day)}>Clear day</button></div>
                  )}
                </td>
                {data.periods.map((p, index) => {
                  if (p.isBreak) return <td key={p.key} className="tt-break">{breakHappens(d.day, index) ? p.label : ''}</td>;
                  if (!happens(d.day, p.key)) return <td key={p.key} className="tt-break" title={`${d.name} has only the first ${data.dayCounts[d.day]} periods`}>—</td>;
                  const v = cells[cellKey(d.day, p.key)] || { subjectId: '', teacherId: '' };
                  const clash = clashAt.get(cellKey(d.day, p.key));
                  return (
                    <td key={p.key} className={`tt-cell ${clash ? 'clash' : ''}`} title={clash ? `${clash.teacher} is also in ${clash.classes.join(', ')}` : ''}>
                      {editing ? (
                        <>
                          <select value={v.subjectId} onChange={(e) => setCell(d.day, p.key, { subjectId: e.target.value ? Number(e.target.value) : '' })} aria-label={`${d.name} ${p.label} subject`}>
                            <option value="">—</option>
                            {data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <select value={v.teacherId} onChange={(e) => setCell(d.day, p.key, { teacherId: e.target.value ? Number(e.target.value) : '' })} aria-label={`${d.name} ${p.label} teacher`}>
                            <option value="">Teacher…</option>
                            {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          {(v.subjectId || v.teacherId) && (
                            <button type="button" className="tt-clear" onClick={() => clearCell(d.day, p.key)} aria-label={`Clear ${d.name} ${p.label}`} title="Clear this period">✕ Clear</button>
                          )}
                        </>
                      ) : (
                        <div className="tt-ro">
                          <strong>{subjectName.get(v.subjectId) || ''}</strong>
                          <span>{teacherName.get(v.teacherId) || ''}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tt-actions no-print">
        <button className="btn btn-ghost" onClick={() => window.print()}>🖨 Print</button>
        {editable && <span className="an-muted">Periods are set under Timetable → Periods.</span>}
      </div>
    </div>
  );
}
