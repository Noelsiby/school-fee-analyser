import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';
import { waLabel } from '../../utils/whatsappStatus';
import './Attendance.css';
import '../analysis/Analysis.css';
import '../../pages/students/StudentProfile.css'; // WhatsApp button

const STATUS = [
  { key: 'P', label: 'P', title: 'Present' },
  { key: 'A', label: 'A', title: 'Absent' },
  { key: 'L', label: 'L', title: 'Leave (parent informed)' },
  { key: 'T', label: 'T', title: 'Late (counts as present)' },
];

/**
 * Take attendance for one class, date and slot (day / FN / AN / period).
 * Everyone starts as Present: tap only the absent students, then Save.
 * After saving, "Inform parents" sends WhatsApp messages to parents of absent students.
 */
export default function AttendanceRegister({ initialClassId, initialDate, initialSlot, canInform = true }) {
  const { apiCall } = useApi();
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState(initialClassId ? String(initialClassId) : '');
  const [date, setDate]       = useState(initialDate || '');
  const [slot, setSlot]       = useState(initialSlot || '');
  const [reg, setReg]         = useState(null);
  const [marks, setMarks]     = useState({});    // studentId → { status, reason }
  const [dirty, setDirty]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [notice, setNotice]   = useState('');
  const [error, setError]     = useState('');
  const [inform, setInform]   = useState([]);    // studentIds ticked for WhatsApp
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiCall('/api/attendance/classes').then((d) => {
      setClasses(d.classes);
      if (!classId && d.classes[0]) setClassId(String((d.classes.find((c) => c.isClassTeacher) || d.classes[0]).id));
    }).catch((e) => setError(e.message));
  }, [apiCall]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!classId) return;
    setError('');
    const q = new URLSearchParams({ ...(date ? { date } : {}), ...(slot ? { slot } : {}) });
    const d = await apiCall(`/api/attendance/classes/${classId}?${q}`);
    setReg(d);
    if (!date) setDate(d.date);
    if (slot !== d.slot) setSlot(d.slot);
    setMarks(Object.fromEntries(d.students.map((s) => [s.id, { status: s.status || 'P', reason: s.reason || '' }])));
    setDirty(false);
    setInform(d.students.filter((s) => (s.status === 'A' || Object.values(s.day).includes('A')) && s.hasPhone && !s.alert).map((s) => s.id));
  }, [apiCall, classId, date, slot]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  // Keep WhatsApp statuses fresh while messages are going out
  useEffect(() => {
    if (!reg?.students.some((s) => s.alert?.status === 'queued')) return;
    const t = setTimeout(() => load().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [reg, load]);

  const setStatus = (id, status) => {
    setMarks((m) => ({ ...m, [id]: { ...m[id], status } }));
    setDirty(true); setNotice('');
  };
  const setReason = (id, reason) => { setMarks((m) => ({ ...m, [id]: { ...m[id], reason } })); setDirty(true); };
  const markAll = (status) => { setMarks((m) => Object.fromEntries(Object.keys(m).map((id) => [id, { ...m[id], status }]))); setDirty(true); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const records = Object.entries(marks).map(([studentId, v]) => ({ studentId: Number(studentId), status: v.status, reason: v.reason || null }));
      const d = await apiCall(`/api/attendance/classes/${classId}`, { method: 'PUT', body: { date, slot, records } });
      setNotice(`✅ Saved. ${d.absent ? `${d.absent} absent.` : 'Everyone present.'}`);
      await load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const sendInform = async () => {
    if (!window.confirm(`Send a WhatsApp message to ${inform.length} parent${inform.length === 1 ? '' : 's'}?`)) return;
    setSending(true);
    try {
      const d = await apiCall('/api/attendance/alerts', { method: 'POST', body: { classId: Number(classId), date, studentIds: inform } });
      setNotice(`💬 Sending to ${d.queued} parent${d.queued === 1 ? '' : 's'}.${d.skipped.length ? ` Skipped: ${d.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}.` : ''}`);
      await load();
    } catch (e) { setError(e.message); } finally { setSending(false); }
  };

  if (!classes) return error ? <div className="alert alert-error">⚠ {error}</div> : <div className="spinner spinner-dark" />;
  if (!classes.length) {
    return <p className="an-muted">You don't take attendance for any class. In “once a day” and “morning + afternoon” modes the class teacher takes it; in “every period” mode, the teacher of each period.</p>;
  }

  const counts = reg ? Object.values(marks).reduce((c, v) => ({ ...c, [v.status]: (c[v.status] || 0) + 1 }), {}) : {};
  const closed = reg && (reg.holiday || reg.weeklyOff);
  const absentStudents = reg ? reg.students.filter((s) => s.status === 'A' || Object.values(s.day).includes('A')) : [];
  const today = reg?.isToday ? reg.date : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 10 }}>{notice}</div>}

      <div className="at-toolbar">
        <select className="form-select" value={classId} onChange={(e) => { setClassId(e.target.value); setReg(null); }} aria-label="Class">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" className="form-input" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        {reg && <span className="an-muted">{reg.dateLabel}</span>}
      </div>

      {reg && reg.slots.length > 1 && (
        <div className="at-slots">
          {reg.slots.map((s) => (
            <button key={s.key} type="button" className={`at-slot ${s.key === slot ? 'active' : ''}`} onClick={() => setSlot(s.key)}>
              {s.label}{s.marked && <span className="dot" title="Marked" />}
            </button>
          ))}
        </div>
      )}

      {!reg ? <div className="spinner spinner-dark" /> : reg.noPeriods ? (
        <div className="alert alert-info">This class has no periods on this day. The admin sets periods in Timetable → Periods.</div>
      ) : closed ? (
        <div className="alert alert-info">🏖️ {reg.holiday ? `Holiday: ${reg.holiday.name}` : 'Weekly off day'}. No attendance needed.</div>
      ) : (
        <>
          <div className="at-counts">
            <span className={`badge ${reg.marked ? 'badge-green' : 'badge-amber'}`}>{reg.marked ? '✓ Marked' : 'Not saved yet'}</span>
            <span className="badge badge-green">{(counts.P || 0) + (counts.T || 0)} present</span>
            <span className="badge badge-red">{counts.A || 0} absent</span>
            {counts.L > 0 && <span className="badge badge-blue">{counts.L} leave</span>}
            {counts.T > 0 && <span className="badge badge-amber">{counts.T} late</span>}
          </div>
          {!reg.canMark && <div className="alert alert-info" style={{ marginBottom: 10 }}>👀 You can see this register, but only {reg.mode === 'periods' ? "this period's teacher" : 'the class teacher'} or the admin can change it.</div>}
          <p className="at-legend">P present · A absent · L leave (parent informed) · T late (counts as present). Everyone starts as present; tap only those who aren't.</p>

          {reg.canMark && (
            <div className="at-toolbar">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => markAll('P')}>Mark all present</button>
            </div>
          )}

          <div className="at-list">
            {reg.students.map((s) => {
              const m = marks[s.id] || { status: 'P' };
              return (
                <div key={s.id} className={`at-row is-${m.status}`}>
                  <span className="at-roll">{s.rollNumber}</span>
                  <span className="at-name">{s.name}</span>
                  <div className="at-buttons" role="group" aria-label={`${s.name} attendance`}>
                    {STATUS.map((st) => (
                      <button key={st.key} type="button" title={st.title} aria-pressed={m.status === st.key}
                        className={`at-btn ${m.status === st.key ? `on-${st.key}` : ''}`}
                        disabled={!reg.canMark} onClick={() => setStatus(s.id, st.key)}>{st.label}</button>
                    ))}
                  </div>
                  {(m.status === 'A' || m.status === 'L') && (
                    <div className="at-reason">
                      <input className="form-input" placeholder="Reason (optional)" value={m.reason} maxLength={120} disabled={!reg.canMark}
                        onChange={(e) => setReason(s.id, e.target.value)} aria-label={`Reason for ${s.name}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {reg.canMark && (
            <div className="at-save">
              <button className="btn btn-primary" disabled={saving || (!dirty && reg.marked)} onClick={save}>
                {saving ? <span className="spinner" /> : reg.marked ? 'Save changes' : 'Save attendance'}
              </button>
              {dirty && <span className="an-muted">Not saved yet</span>}
            </div>
          )}

          {canInform && reg.marked && absentStudents.length > 0 && (
            <div className="at-inform">
              <strong>💬 Inform parents of absent students</strong>
              <p className="an-muted" style={{ margin: '4px 0 8px' }}>Sends a WhatsApp message only to the parents you tick. Students on leave aren't listed: their parents already know.</p>
              {!reg.waConfigured && <p className="an-muted">WhatsApp isn't set up yet.</p>}
              {absentStudents.map((s) => {
                const label = waLabel(s.alert?.status);
                return (
                  <label key={s.id} className="an-pick">
                    <input type="checkbox" checked={inform.includes(s.id)} disabled={!s.hasPhone}
                      onChange={() => setInform((x) => (x.includes(s.id) ? x.filter((i) => i !== s.id) : [...x, s.id]))} />
                    <span>{s.name}</span>
                    {!s.hasPhone && <span className="badge badge-red">No parent number</span>}
                    {label && <span className={`badge badge-${label.tone}`} title={s.alert.error || ''}>{label.icon} {label.text}</span>}
                  </label>
                );
              })}
              <button className="btn btn-whatsapp btn-sm" style={{ marginTop: 8 }} disabled={!inform.length || sending || !reg.waConfigured} onClick={sendInform}>
                {sending ? <span className="spinner" /> : `💬 Send to ${inform.length} parent${inform.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
