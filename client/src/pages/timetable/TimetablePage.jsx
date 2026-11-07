import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';
import TimetableGrid from '../../components/timetable/TimetableGrid';
import { ClassPicker, byClassName } from '../../components/SubjectFields';
import '../admin/admin.css';
import '../admin/ClassDetailPage.css';
import '../students/StudentProfile.css';
import '../../components/attendance/Attendance.css';
import '../../components/analysis/Analysis.css';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

// ── One class at a time, editable, with "copy to other classes" ──
function ClassTab({ classes }) {
  const { apiCall } = useApi();
  const [classId, setClassId] = useState(classes[0] ? String(classes[0].id) : '');
  const [copyOpen, setCopyOpen] = useState(false);
  const [targets, setTargets] = useState([]);
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);

  const copy = async () => {
    try {
      const d = await apiCall('/api/timetable/copy', { method: 'POST', body: { fromClassId: Number(classId), toClassIds: targets } });
      const skipped = d.result.reduce((m, r) => m + r.skipped, 0);
      setNotice(`✅ Copied to ${d.result.length} class${d.result.length === 1 ? '' : 'es'}.${skipped ? ` ${skipped} period(s) skipped where that class has no subject with the same name.` : ''} Teachers are kept only where they teach that subject in the other class.`);
      setCopyOpen(false); setTargets([]);
    } catch (e) { setNotice(`⚠ ${e.message}`); }
  };

  return (
    <div>
      <div className="at-toolbar no-print">
        <select className="form-select" value={classId} onChange={(e) => { setClassId(e.target.value); setNotice(''); }} aria-label="Class">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setCopyOpen((v) => !v)}>📋 Copy this timetable to other classes…</button>
      </div>
      {notice && <div className={`alert ${notice.startsWith('✅') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 10 }}>{notice}</div>}
      {copyOpen && (
        <div className="an-box no-print" style={{ marginBottom: 12 }}>
          <p style={{ marginTop: 0 }}>Copy to these classes (their current timetable is replaced). Subjects are matched by name.</p>
          <ClassPicker classes={classes.filter((c) => String(c.id) !== classId)} selected={targets} onChange={setTargets} />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!targets.length} onClick={copy}>Copy to {targets.length} class{targets.length === 1 ? '' : 'es'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCopyOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {classId && <TimetableGrid key={`${classId}-${version}`} classId={Number(classId)} editable onSaved={() => setVersion((v) => v)} />}
    </div>
  );
}

// ── Every class on one day, read-only, plus all clashes ──
function AllTab() {
  const { apiCall } = useApi();
  const [data, setData] = useState(null);
  const [day, setDay] = useState(null);
  useEffect(() => {
    apiCall('/api/timetable/overview').then((d) => {
      setData(d);
      const now = new Date().getDay();
      setDay(d.days.some((x) => x.day === now) ? now : d.days[0]?.day);
    }).catch(() => {});
  }, [apiCall]);
  if (!data) return <div className="spinner spinner-dark" />;
  const cell = (c, key) => c.entries.find((e) => e.day === day && e.periodKey === key);
  return (
    <div>
      <div className="at-slots no-print">
        {data.days.map((d) => <button key={d.day} className={`at-slot ${d.day === day ? 'active' : ''}`} onClick={() => setDay(d.day)}>{d.name}</button>)}
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨 Print</button>
      </div>
      {data.periods.length === 0 && <p className="an-muted">No periods set yet. Set them in the Periods tab first.</p>}
      {data.clashes.length > 0 && (
        <div className="alert alert-error" style={{ marginBottom: 10 }}>
          ⚠ {data.clashes.length} clash{data.clashes.length === 1 ? '' : 'es'}:{' '}
          {data.clashes.map((c, i) => <span key={i}>{c.teacher} ({c.dayName}, {data.periods.find((p) => p.key === c.periodKey)?.label}: {c.classes.join(' + ')}){i < data.clashes.length - 1 ? '; ' : ''}</span>)}
        </div>
      )}
      <div className="tt-wrap">
        <table className="tt-grid">
          <thead><tr><th>Class</th>{data.periods.map((p) => <th key={p.key}>{p.label}{p.start && <small>{p.start}</small>}</th>)}</tr></thead>
          <tbody>
            {data.classes.map((c) => (
              <tr key={c.id}>
                <td className="tt-day">{c.name}</td>
                {data.periods.map((p) => {
                  if (p.isBreak) return <td key={p.key} className="tt-break" />;
                  if (!(c.dayKeys?.[day] || []).includes(p.key)) return <td key={p.key} className="tt-break" title="No such period for this class on this day" />;
                  const e = cell(c, p.key);
                  const clash = e && data.clashes.some((x) => x.day === day && x.periodKey === p.key && x.classes.includes(c.name));
                  return <td key={p.key} className={`tt-cell ${clash ? 'clash' : ''}`}><div className="tt-ro"><strong>{e?.subject || ''}</strong><span>{e?.teacher || ''}</span></div></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── A teacher's week ──
function TeacherTab() {
  const { apiCall } = useApi();
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState('');
  const [data, setData] = useState(null);
  useEffect(() => {
    apiCall('/api/admin/teachers').then((d) => {
      const list = (d.teachers || d).slice().sort((a, b) => a.name.localeCompare(b.name));
      setTeachers(list);
      if (list[0]) setTeacherId(String(list[0].id));
    }).catch(() => {});
  }, [apiCall]);
  useEffect(() => { if (teacherId) apiCall(`/api/timetable/teachers/${teacherId}`).then(setData).catch(() => {}); }, [apiCall, teacherId]);
  return (
    <div>
      <div className="at-toolbar no-print">
        <select className="form-select" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label="Teacher">
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨 Print</button>
      </div>
      {data && <TeacherWeek data={data} />}
    </div>
  );
}

export function TeacherWeek({ data }) {
  const at = (day, key) => data.entries.filter((e) => e.day === day && e.periodKey === key);
  return (
    <div className="tt-wrap">
      <table className="tt-grid">
        <thead><tr><th>{data.teacher.name}</th>{data.periods.map((p) => <th key={p.key}>{p.label}{p.start && <small>{p.start}</small>}</th>)}</tr></thead>
        <tbody>
          {data.days.map((d) => (
            <tr key={d.day}>
              <td className="tt-day">{d.name.slice(0, 3)}</td>
              {data.periods.map((p) => {
                if (p.isBreak) return <td key={p.key} className="tt-break">{p.label}</td>;
                const list = at(d.day, p.key);
                return <td key={p.key} className={`tt-cell ${list.length > 1 ? 'clash' : ''}`}>{list.map((e, i) => <div key={i} className="tt-ro"><strong>{e.className}</strong><span>{e.subject || ''}</span></div>)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.entries.length === 0 && <p className="an-muted">No periods in the timetable yet.</p>}
    </div>
  );
}

// ── Periods: one list for the school, plus lists for groups of classes; shorter days ──
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const blankRow = (label, isBreak = false) => ({ label, start: '', end: '', isBreak });

/** Build "Period 1 … Period N" with an optional short break and lunch. */
function buildPeriods(count, breakAfter, lunchAfter) {
  const list = [];
  for (let i = 1; i <= count; i++) {
    list.push(blankRow(`Period ${i}`));
    if (breakAfter === i && i < count) list.push(blankRow('Short break', true));
    if (lunchAfter === i && i < count) list.push(blankRow('Lunch', true));
  }
  return list;
}

function ScheduleCard({ schedule, index, classes, takenElsewhere, days, onChange, onRemove }) {
  const [quick, setQuick] = useState({ count: '', breakAfter: '', lunchAfter: '' });
  const teaching = schedule.periods.filter((p) => !p.isBreak).length;
  const nums = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
  const set = (patch) => onChange({ ...schedule, ...patch });
  const setRow = (i, patch) => set({ periods: schedule.periods.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const move = (i, by) => { const c = [...schedule.periods]; const [x] = c.splice(i, 1); c.splice(i + by, 0, x); set({ periods: c }); };
  const build = () => {
    const n = Number(quick.count);
    if (!n) return;
    set({ periods: buildPeriods(n, Number(quick.breakAfter) || null, Number(quick.lunchAfter) || null), dayCounts: {} });
  };
  const setDayCount = (day, value) => {
    const dayCounts = { ...(schedule.dayCounts || {}) };
    if (value) dayCounts[day] = Number(value); else delete dayCounts[day];
    set({ dayCounts });
  };

  return (
    <div className="an-box" style={{ marginBottom: 16 }}>
      <div className="an-head" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input className="form-input" style={{ width: 220 }} value={schedule.name} maxLength={40}
            onChange={(e) => set({ name: e.target.value })} aria-label="Name of this period list" />
          <span className="an-muted">{teaching} period{teaching === 1 ? '' : 's'} a day</span>
        </div>
        {index > 0 && <button className="btn btn-danger btn-sm" onClick={onRemove}>Remove this list</button>}
      </div>

      {index === 0 ? (
        <p className="an-muted" style={{ marginTop: 0 }}>The school's main list: every class follows it unless it's in another list below.</p>
      ) : (
        <div style={{ marginBottom: 10 }}>
          <p className="an-muted" style={{ marginTop: 0 }}>Classes that follow this list instead of the main one:</p>
          <ClassPicker classes={classes.filter((c) => !takenElsewhere.includes(c.id))} selected={schedule.classIds} onChange={(ids) => set({ classIds: ids })} />
        </div>
      )}

      <div className="at-toolbar" style={{ background: '#f8fafc', padding: 8, borderRadius: 8 }}>
        <strong style={{ fontSize: '0.85rem' }}>Quick setup:</strong>
        <select className="form-select" style={{ minWidth: 150 }} value={quick.count} onChange={(e) => setQuick((q) => ({ ...q, count: e.target.value }))} aria-label="Periods a day">
          <option value="">Periods a day…</option>
          {nums(14).map((n) => <option key={n} value={n}>{n} periods</option>)}
        </select>
        <select className="form-select" style={{ minWidth: 170 }} value={quick.breakAfter} onChange={(e) => setQuick((q) => ({ ...q, breakAfter: e.target.value }))} aria-label="Short break after period">
          <option value="">No short break</option>
          {nums(Math.max(0, Number(quick.count) - 1)).map((n) => <option key={n} value={n}>Short break after period {n}</option>)}
        </select>
        <select className="form-select" style={{ minWidth: 150 }} value={quick.lunchAfter} onChange={(e) => setQuick((q) => ({ ...q, lunchAfter: e.target.value }))} aria-label="Lunch after period">
          <option value="">No lunch break</option>
          {nums(Math.max(0, Number(quick.count) - 1)).map((n) => <option key={n} value={n}>Lunch after period {n}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" disabled={!quick.count} onClick={build}>Build list</button>
      </div>

      {schedule.periods.length === 0 ? <p className="an-muted">No periods yet. Use the quick setup above, or add them one by one.</p> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Starts (optional)</th><th>Ends (optional)</th><th>Break?</th><th></th></tr></thead>
            <tbody>{schedule.periods.map((p, i) => (
              <tr key={i}>
                <td><input className="form-input" value={p.label} maxLength={30} onChange={(e) => setRow(i, { label: e.target.value })} aria-label="Period name" /></td>
                <td><input type="time" className="form-input" value={p.start || ''} onChange={(e) => setRow(i, { start: e.target.value })} aria-label="Start time" /></td>
                <td><input type="time" className="form-input" value={p.end || ''} onChange={(e) => setRow(i, { end: e.target.value })} aria-label="End time" /></td>
                <td><input type="checkbox" checked={!!p.isBreak} onChange={(e) => setRow(i, { isBreak: e.target.checked })} aria-label="Break" /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button className="btn btn-ghost btn-sm" disabled={i === schedule.periods.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button className="btn btn-danger btn-sm" onClick={() => set({ periods: schedule.periods.filter((_, k) => k !== i) })} aria-label="Remove">🗑️</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="tt-actions" style={{ marginTop: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => set({ periods: [...schedule.periods, blankRow(`Period ${teaching + 1}`)] })}>+ Add period</button>
        <button className="btn btn-ghost btn-sm" onClick={() => set({ periods: [...schedule.periods, blankRow('Break', true)] })}>+ Add break</button>
      </div>

      {teaching > 1 && (
        <div style={{ marginTop: 12 }}>
          <strong style={{ fontSize: '0.88rem' }}>Shorter days</strong>
          <p className="an-muted" style={{ margin: '2px 0 6px' }}>For example a Saturday half day: only the first few periods happen.</p>
          <div className="an-chips">
            {days.map((d) => (
              <label key={d.day} className="an-pick" style={{ marginRight: 12 }}>
                {d.name}
                <select className="form-select" style={{ width: 'auto', minWidth: 120 }} value={schedule.dayCounts?.[d.day] || ''} onChange={(e) => setDayCount(d.day, e.target.value)} aria-label={`${d.name} periods`}>
                  <option value="">All {teaching}</option>
                  {nums(teaching - 1).map((n) => <option key={n} value={n}>Only first {n}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PeriodsTab({ onSaved }) {
  const { apiCall } = useApi();
  const [schedules, setSchedules] = useState(null);
  const [days, setDays] = useState([]);
  const [classes, setClasses] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    apiCall('/api/timetable/periods').then((d) => {
      setDays(d.days);
      setSchedules(d.schedules.length ? d.schedules : [{ name: 'Whole school', classIds: [], periods: [], dayCounts: {} }]);
    }).catch(() => {});
    apiCall('/api/admin/classes').then((d) => setClasses([...d.classes].sort(byClassName))).catch(() => {});
  }, [apiCall]);

  const change = (i, s) => { setSchedules((list) => list.map((x, k) => (k === i ? s : x))); setDirty(true); setNotice(''); };
  const add = () => { setSchedules((l) => [...l, { name: `Period list ${l.length + 1}`, classIds: [], periods: [], dayCounts: {} }]); setDirty(true); };
  const remove = (i) => { setSchedules((l) => l.filter((_, k) => k !== i)); setDirty(true); };

  const save = async () => {
    try {
      const d = await apiCall('/api/timetable/periods', { method: 'PUT', body: { schedules } });
      setSchedules(d.schedules); setDirty(false);
      setNotice(`✅ Periods saved.${d.removedCells ? ` ${d.removedCells} timetable cell(s) for periods that no longer exist were cleared.` : ''}`);
      onSaved?.();
    } catch (e) { setNotice(`⚠ ${e.message}`); }
  };

  if (!schedules) return <div className="spinner spinner-dark" />;
  return (
    <div>
      <p className="an-muted" style={{ marginTop: 0 }}>
        Set how many periods your school has. If some classes have a different number (for example LKG–Class 2 with 5 periods),
        add another list for those classes. Times are optional.
      </p>
      {notice && <div className={`alert ${notice.startsWith('✅') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 10 }}>{notice}</div>}
      {schedules.map((s, i) => (
        <ScheduleCard key={i} schedule={s} index={i} classes={classes} days={days}
          takenElsewhere={schedules.filter((_, k) => k !== i && k > 0).flatMap((x) => x.classIds || [])}
          onChange={(v) => change(i, v)} onRemove={() => remove(i)} />
      ))}
      <div className="tt-actions">
        <button className="btn btn-ghost" onClick={add}>+ Another period list for some classes</button>
        <button className="btn btn-primary" disabled={!dirty} onClick={save}>Save periods</button>
        <span className="an-muted">Removing a period also clears it from the timetables that used it.</span>
      </div>
    </div>
  );
}

// ── Substitutions for an absent teacher ──
function SubsTab() {
  const { apiCall } = useApi();
  const [date, setDate] = useState(today());
  const [teachers, setTeachers] = useState([]);
  const [absent, setAbsent] = useState('');
  const [plan, setPlan] = useState(null);
  const [list, setList] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => { apiCall('/api/admin/teachers').then((d) => setTeachers((d.teachers || d).slice().sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {}); }, [apiCall]);
  const loadList = useCallback(() => apiCall(`/api/timetable/substitutions?date=${date}`).then((d) => setList(d.substitutions)).catch(() => {}), [apiCall, date]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    if (!absent) { setPlan(null); return; }
    apiCall(`/api/timetable/substitutions/plan?date=${date}&teacherId=${absent}`).then(setPlan).catch(() => {});
  }, [apiCall, date, absent, list]);

  const assign = async (p, substituteId) => {
    if (!substituteId) return;
    try {
      await apiCall('/api/timetable/substitutions', { method: 'POST', body: { date, classId: p.classId, periodKey: p.periodKey, substituteId: Number(substituteId), absentTeacherId: Number(absent) } });
      setNotice('✅ Substitute set. Their "My periods today" now shows this period.');
      await loadList();
    } catch (e) { setNotice(`⚠ ${e.message}`); }
  };
  const remove = async (id) => { await apiCall(`/api/timetable/substitutions/${id}`, { method: 'DELETE' }).catch(() => {}); loadList(); };

  return (
    <div>
      <div className="at-toolbar">
        <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <select className="form-select" value={absent} onChange={(e) => setAbsent(e.target.value)} aria-label="Absent teacher">
          <option value="">Which teacher is absent?</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {notice && <div className={`alert ${notice.startsWith('✅') ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 10 }}>{notice}</div>}
      {plan && (
        plan.periods.length === 0 ? <p className="an-muted">This teacher has no periods on that day in the timetable.</p> : (
          <div className="data-table-wrap" style={{ marginBottom: 16 }}>
            <table className="data-table">
              <thead><tr><th>Period</th><th>Class</th><th>Subject</th><th>Substitute (teachers free in that period)</th></tr></thead>
              <tbody>{plan.periods.map((p) => (
                <tr key={`${p.classId}-${p.periodKey}`}>
                  <td>{p.periodLabel}</td><td>{p.className}</td><td>{p.subject || '—'}</td>
                  <td>
                    <select className="form-select" value={p.substituteId || ''} onChange={(e) => assign(p, e.target.value)} aria-label={`Substitute for ${p.periodLabel}`}>
                      <option value="">Choose a teacher…</option>
                      {p.free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      {p.substituteId && !p.free.some((t) => t.id === p.substituteId) && <option value={p.substituteId}>(current substitute)</option>}
                    </select>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}
      <h4 style={{ margin: '0 0 6px', color: '#1e3a8a' }}>Substitutions on this day</h4>
      {list.length === 0 ? <p className="an-muted">None.</p> : (
        <ul className="an-list">
          {list.map((s) => (
            <li key={s.id}>{s.periodLabel} · {s.className}: <strong>{s.substitute}</strong> instead of {s.absentTeacher || 'the usual teacher'}{' '}
              <button className="cr-link" style={{ fontSize: '0.8rem' }} onClick={() => remove(s.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Admin → Timetable */
export default function TimetablePage() {
  const { apiCall } = useApi();
  const [classes, setClasses] = useState(null);
  const [periodsSaved, setPeriodsSaved] = useState(true);
  const [tab, setTab] = useState('class');
  useEffect(() => { apiCall('/api/admin/classes').then((d) => setClasses([...d.classes].sort(byClassName))).catch(() => setClasses([])); }, [apiCall]);
  // First visit: open the Periods tab until the school has saved its own periods
  useEffect(() => {
    apiCall('/api/timetable/periods').then((d) => { setPeriodsSaved(d.saved); if (!d.saved) setTab('periods'); }).catch(() => {});
  }, [apiCall]);
  // Re-check after changing tabs (e.g. right after saving periods) so the notice goes away
  useEffect(() => { apiCall('/api/timetable/periods').then((d) => setPeriodsSaved(d.saved)).catch(() => {}); }, [apiCall, tab]);
  const TABS = [['class', '🏛️ Class timetables'], ['all', '📋 All classes'], ['teachers', '👩‍🏫 Teachers'], ['subs', '🔁 Substitutions'], ['periods', '⏱️ Periods']];
  return (
    <div className="admin-page">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Timetable</h1>
          <p className="page-sub">Set each class's week, see every class at once, check clashes, and arrange substitutes.</p>
        </div>
      </div>
      {!periodsSaved && (
        <div className="alert alert-info no-print" style={{ marginBottom: 12 }}>
          ℹ️ Your school's periods aren't set yet. Set how many periods your school has (5, 8, 9…), where the breaks are,
          and any classes or days with fewer periods, then press <strong>Save periods</strong>. Timetables can be filled in after that.
        </div>
      )}
      <div className="detail-tabs no-print">
        {TABS.map(([k, label]) => <button key={k} className={`detail-tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div className="data-card" style={{ padding: 20 }}>
        {!classes ? <div className="spinner spinner-dark" /> : (
          <>
            {tab === 'class' && <ClassTab classes={classes} />}
            {tab === 'all' && <AllTab />}
            {tab === 'teachers' && <TeacherTab />}
            {tab === 'subs' && <SubsTab />}
            {tab === 'periods' && <PeriodsTab onSaved={() => setPeriodsSaved(true)} />}
          </>
        )}
      </div>
    </div>
  );
}
