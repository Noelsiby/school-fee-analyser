import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import './Attendance.css';
import '../analysis/Analysis.css';

const MODES = [
  { key: 'daily',    title: 'Once a day',          text: 'The class teacher takes attendance once each day.' },
  { key: 'sessions', title: 'Morning + Afternoon', text: 'Taken twice a day (FN and AN). Each counts as half a day.' },
  { key: 'periods',  title: 'Every period',        text: 'The teacher of each period takes it. Uses the periods set in Timetable → Periods.' },
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const nice = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Admin → Attendance → Settings: how attendance is taken, weekly off days, holidays. */
export default function AttendanceSettings() {
  const { apiCall } = useApi();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [hDate, setHDate] = useState('');
  const [hName, setHName] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = () => apiCall('/api/attendance/settings')
    .then((d) => { setForm(d.settings); setSaved(d.settings); setHolidays(d.holidays); })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setError(''); setNotice('');
    try {
      const d = await apiCall('/api/attendance/settings', { method: 'PUT', body: form });
      setSaved(d.settings); setForm(d.settings);
      setNotice(`✅ Saved. Attendance is now taken: ${MODES.find((m) => m.key === d.settings.mode).title.toLowerCase()}.`);
    } catch (e) { setError(e.message); }
  };
  const addHoliday = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/api/attendance/holidays', { method: 'POST', body: { date: hDate, name: hName } });
      setHDate(''); setHName(''); await load();
    } catch (err) { setError(err.message); }
  };
  const removeHoliday = async (id) => {
    try { await apiCall(`/api/attendance/holidays/${id}`, { method: 'DELETE' }); await load(); } catch (err) { setError(err.message); }
  };

  if (!form) return error ? <div className="alert alert-error">⚠ {error}</div> : <div className="spinner spinner-dark" />;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  return (
    <div>
      {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>⚠ {error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 10 }}>{notice}</div>}

      <div className="an-box" style={{ marginBottom: 14 }}>
        <h4>How does your school take attendance?</h4>
        {MODES.map((m) => (
          <label key={m.key} className="an-pick" style={{ alignItems: 'flex-start', padding: '6px 0' }}>
            <input type="radio" name="mode" checked={form.mode === m.key} onChange={() => setForm((f) => ({ ...f, mode: m.key }))} style={{ marginTop: 3 }} />
            <span><strong>{m.title}</strong><br /><span className="an-muted">{m.text}</span></span>
          </label>
        ))}
        {form.mode === 'periods' && (
          <div style={{ marginTop: 8 }}>
            <label className="form-label">A student counts as present for the day when they attend…</label>
            <select className="form-select" style={{ width: 'auto' }} value={form.periodRule} onChange={(e) => setForm((f) => ({ ...f, periodRule: e.target.value }))}>
              <option value="half">at least half of the periods taken</option>
              <option value="fraction">counted part by part (e.g. 6 of 8 periods = 0.75 day)</option>
            </select>
          </div>
        )}
        <p className="an-muted" style={{ marginTop: 8 }}>You can change this later. Attendance already taken is kept.</p>
      </div>

      <div className="an-box" style={{ marginBottom: 14 }}>
        <h4>Weekly off days</h4>
        <div className="an-chips">
          {DAYS.map((d, i) => (
            <label key={d} className="an-pick" style={{ marginRight: 10 }}>
              <input type="checkbox" checked={form.weeklyOff.includes(i)}
                onChange={() => setForm((f) => ({ ...f, weeklyOff: f.weeklyOff.includes(i) ? f.weeklyOff.filter((x) => x !== i) : [...f.weeklyOff, i] }))} />
              {d}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-primary" disabled={!dirty} onClick={save}>Save settings</button>
        {dirty && <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => setForm(saved)}>Cancel</button>}
      </div>

      <div className="an-box">
        <h4>🏖️ Holidays this academic year</h4>
        <form onSubmit={addHoliday} className="at-toolbar">
          <input type="date" className="form-input" value={hDate} onChange={(e) => setHDate(e.target.value)} aria-label="Holiday date" required />
          <input className="form-input" placeholder="e.g. Diwali" value={hName} maxLength={80} onChange={(e) => setHName(e.target.value)} aria-label="Holiday name" required />
          <button className="btn btn-primary btn-sm" disabled={!hDate || !hName.trim()}>Add holiday</button>
        </form>
        {holidays.length === 0 ? <p className="an-muted">No holidays added yet. Holidays aren't counted as school days.</p> : (
          <ul className="an-list">
            {holidays.map((h) => (
              <li key={h.id}>{nice(h.date)}: <strong>{h.name}</strong>{' '}
                <button type="button" className="cr-link" style={{ fontSize: '0.8rem' }} onClick={() => removeHoliday(h.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
