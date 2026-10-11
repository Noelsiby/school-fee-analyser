import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import { ClassPicker, byClassName } from '../../components/SubjectFields';
import { waLabel, formatPhone } from '../../utils/whatsappStatus';
import { byRoll } from '../../utils/rollOrder';
import './admin.css';
import '../students/StudentProfile.css'; // WhatsApp button, chips, links
import './MessagesPage.css';

const TITLE_MAX = 60;
const BODY_MAX = 700;
const DAILY_LIMIT = 250; // WhatsApp's current limit: different parents per 24 hours

const TOPICS = ['Holiday', 'Leave', 'Parent-Teacher Meeting', 'Fee Reminder', 'School Event', 'Exam Timetable', 'Important Notice'];

// Must match the approved "school_notice" template in RichAutomate ({{1}} subject, {{2}} message).
const previewText = (title, body) => [
  'Dear Parent,',
  'This is a message from Matha English Medium School.',
  '',
  `Subject: ${title || '…'}`,
  oneLine(body) || '…',
  '',
  'For any questions, please contact the school office.',
  'Thank you.',
].join('\n');

// WhatsApp template values can't have line breaks, so the message is sent as one paragraph.
const oneLine = (s) => s.replace(/\s*[\r\n]+\s*/g, ' ').replace(/ {4,}/g, '   ').trim();

const formatWhen = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function audienceLabel(a, classNames) {
  if (a?.type === 'school') return 'Whole school';
  if (a?.type === 'classes') {
    const names = a.classIds.map(id => classNames[id]).filter(Boolean).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ');
  }
  if (a?.type === 'students') return `${a.studentIds.length} selected student${a.studentIds.length === 1 ? '' : 's'}`;
  return '—';
}

/**
 * Admin → Messages: send a school notice (holiday, leave, meeting…) to parents on WhatsApp,
 * to the whole school, some classes, or chosen students; and see delivery of past notices.
 */
export default function MessagesPage() {
  const { apiCall } = useApi();

  const [classes, setClasses]       = useState([]);
  const [notices, setNotices]       = useState([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [notice, setNotice]         = useState('');

  // Compose
  const [title, setTitle]       = useState('');
  const [body, setBody]         = useState('');
  const [type, setType]         = useState('school');      // school | classes | students
  const [classIds, setClassIds] = useState([]);
  const [studentIds, setStudentIds] = useState([]);
  const [pickClass, setPickClass]   = useState('');
  const [classStudents, setClassStudents] = useState({});   // classId → students
  const [preview, setPreview]   = useState(null);          // { students, parents, skipped }
  const [showSkipped, setShowSkipped] = useState(false);
  const [confirm, setConfirm]   = useState(false);
  const [sending, setSending]   = useState(false);

  // History
  const [open, setOpen]     = useState(null);   // notice detail being viewed
  const [busy, setBusy]     = useState({});

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 7000); };

  const loadNotices = useCallback(async () => {
    const d = await apiCall('/api/admin/notices');
    setNotices(d.notices);
    setConfigured(d.configured);
  }, [apiCall]);

  useEffect(() => {
    Promise.all([apiCall('/api/admin/classes').then(d => setClasses(d.classes)), loadNotices()])
      .catch(e => setError(e.message || 'Failed to load.'))
      .finally(() => setLoading(false));
  }, [apiCall, loadNotices]);

  const classNames = useMemo(() => Object.fromEntries(classes.map(c => [c.id, c.name])), [classes]);
  const sortedClasses = useMemo(() => [...classes].sort(byClassName), [classes]);

  const audience = useMemo(() => (
    type === 'school' ? { type } : type === 'classes' ? { type, classIds } : { type, studentIds }
  ), [type, classIds, studentIds]);
  const audienceReady = type === 'school' || (type === 'classes' ? classIds.length > 0 : studentIds.length > 0);

  // Who will get it (updates as the choice changes)
  useEffect(() => {
    if (!audienceReady) { setPreview(null); return; }
    let stale = false;
    const t = setTimeout(() => {
      apiCall('/api/admin/notices/recipients', { method: 'POST', body: { audience } })
        .then(d => { if (!stale) setPreview(d); })
        .catch(() => { if (!stale) setPreview(null); });
    }, 300);
    return () => { stale = true; clearTimeout(t); };
  }, [apiCall, audience, audienceReady]);

  // Students of the class being picked from
  useEffect(() => {
    if (!pickClass || classStudents[pickClass]) return;
    apiCall(`/api/students/class/${pickClass}`)
      .then(d => setClassStudents(m => ({ ...m, [pickClass]: [...d.students].sort(byRoll) })))
      .catch(e => setError(e.message));
  }, [apiCall, pickClass, classStudents]);

  // While messages are still going out, keep the history and the open notice up to date
  const pending = notices.some(n => n.counts.queued > 0) || (open?.counts?.queued > 0);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(async () => {
      try {
        await loadNotices();
        if (open) setOpen((await apiCall(`/api/admin/notices/${open.id}`)).notice);
      } catch { /* try again next tick */ }
    }, 3000);
    return () => clearTimeout(t);
  }, [pending, notices, open, loadNotices, apiCall]);

  const toggleStudent = (id) => setStudentIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  const shown = classStudents[pickClass] || [];
  const allShownTicked = shown.length > 0 && shown.every(s => studentIds.includes(s.id));
  const toggleAllShown = () => setStudentIds(ids => (allShownTicked
    ? ids.filter(id => !shown.some(s => s.id === id))
    : [...new Set([...ids, ...shown.map(s => s.id)])]));

  const canSend = configured && title.trim() && oneLine(body) && audienceReady && preview?.parents > 0;

  const send = async () => {
    setSending(true); setError('');
    try {
      const d = await apiCall('/api/admin/notices', { method: 'POST', body: { title: title.trim(), body: oneLine(body), audience } });
      setConfirm(false);
      flash(`✅ Sending to ${d.queued} parent${d.queued === 1 ? '' : 's'}.${d.skipped.length ? ` ${d.skipped.length} student(s) skipped (no parent number).` : ''}`);
      setTitle(''); setBody(''); setStudentIds([]); setClassIds([]);
      await loadNotices();
    } catch (e) {
      setConfirm(false);
      setError(e.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const view = async (id) => {
    setBusy(b => ({ ...b, [`view-${id}`]: true }));
    try { setOpen((await apiCall(`/api/admin/notices/${id}`)).notice); }
    catch (e) { setError(e.message); }
    finally { setBusy(b => ({ ...b, [`view-${id}`]: false })); }
  };

  const action = async (id, what) => {
    setBusy(b => ({ ...b, [what]: true }));
    try {
      const d = await apiCall(`/api/admin/notices/${id}/${what}`, { method: 'POST' });
      if (what === 'retry') flash(`Sending ${d.queued} failed message(s) again.`);
      else flash(d.updated ? `Updated ${d.updated} delivery status(es).` : 'No new delivery updates yet.');
      setOpen((await apiCall(`/api/admin/notices/${id}`)).notice);
      await loadNotices();
    } catch (e) { setError(e.message); }
    finally { setBusy(b => ({ ...b, [what]: false })); }
  };

  if (loading) return <div className="admin-page"><div className="empty-state"><div className="spinner spinner-dark" /></div></div>;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-sub">Send a notice to parents on WhatsApp: holidays, leave, meetings, events, fee reminders and more.</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}
      {!configured && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          ℹ️ WhatsApp sending isn't set up yet. Add <code>RICHAUTOMATE_API_KEY</code> in Render → Environment.
        </div>
      )}

      <div className="msg-layout">
        {/* ── Compose ── */}
        <div className="data-card msg-compose">
          <h3 className="msg-h">New message</h3>

          <label className="form-label">Subject</label>
          <div className="msg-topics">
            {TOPICS.map(t => (
              <button key={t} type="button" className={`msg-topic ${title === t ? 'active' : ''}`} onClick={() => setTitle(t)}>{t}</button>
            ))}
          </div>
          <input className="form-input" value={title} maxLength={TITLE_MAX} placeholder="e.g. Holiday on Monday"
            onChange={e => setTitle(e.target.value)} aria-label="Subject" />

          <label className="form-label" style={{ marginTop: 14 }}>Message</label>
          <textarea className="form-input msg-body" rows={5} value={body} maxLength={BODY_MAX}
            placeholder="e.g. The school will remain closed on Monday, 20 October, for Deepavali. Classes resume on Tuesday."
            onChange={e => setBody(e.target.value)} aria-label="Message" />
          <div className="msg-hint">
            <span>WhatsApp sends it as one paragraph (line breaks are joined).</span>
            <span>{body.length}/{BODY_MAX}</span>
          </div>

          <label className="form-label" style={{ marginTop: 14 }}>Send to</label>
          <div className="msg-audience">
            {[['school', '🏫 Whole school'], ['classes', '🏛️ Choose classes'], ['students', '👦 Choose students']].map(([v, label]) => (
              <label key={v} className={`msg-audience-opt ${type === v ? 'active' : ''}`}>
                <input type="radio" name="audience" value={v} checked={type === v} onChange={() => setType(v)} />
                {label}
              </label>
            ))}
          </div>

          {type === 'classes' && <ClassPicker classes={classes} selected={classIds} onChange={setClassIds} />}

          {type === 'students' && (
            <div className="msg-students">
              <div className="msg-students-head">
                <select className="form-select" value={pickClass} onChange={e => setPickClass(e.target.value)} aria-label="Class">
                  <option value="">Choose a class…</option>
                  {sortedClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <span className="badge badge-blue">{studentIds.length} selected</span>
                {studentIds.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStudentIds([])}>Clear</button>}
              </div>
              {pickClass && (
                <div className="msg-students-list">
                  {!classStudents[pickClass] ? <div className="spinner spinner-dark" /> : shown.length === 0 ? (
                    <p className="msg-muted">No students in this class.</p>
                  ) : (
                    <>
                      <label className="msg-student all">
                        <input type="checkbox" checked={allShownTicked} onChange={toggleAllShown} />
                        <strong>Select all in {classNames[pickClass]}</strong>
                      </label>
                      {shown.map(s => (
                        <label key={s.id} className="msg-student">
                          <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                          <span className="msg-roll">{s.rollNumber}</span>
                          <span className="msg-name">{s.name}</span>
                          {s.parentPhone ? <span className="msg-muted">{formatPhone(s.parentPhone)}</span> : <span className="badge badge-red">No number</span>}
                        </label>
                      ))}
                    </>
                  )}
                </div>
              )}
              <p className="msg-muted" style={{ marginTop: 6 }}>You can pick students from more than one class: choose another class and tick more.</p>
            </div>
          )}

          {/* Who gets it */}
          {audienceReady && preview && (
            <div className="msg-summary">
              <div>
                <strong>{preview.parents}</strong> parent{preview.parents === 1 ? '' : 's'} will get this
                <span className="msg-muted"> ({preview.students} student{preview.students === 1 ? '' : 's'}; brothers and sisters with the same number get one message)</span>
              </div>
              {preview.skipped.length > 0 && (
                <div className="msg-skip">
                  ⚠ {preview.skipped.length} student{preview.skipped.length === 1 ? ' has' : 's have'} no valid parent number and will be skipped.{' '}
                  <button type="button" className="cr-link" onClick={() => setShowSkipped(v => !v)}>{showSkipped ? 'Hide' : 'Show'}</button>
                  {showSkipped && (
                    <ul className="msg-skip-list">
                      {preview.skipped.map(s => <li key={s.id}>{s.name} <span className="msg-muted">({s.className}) · {s.reason}</span></li>)}
                    </ul>
                  )}
                </div>
              )}
              {preview.parents > DAILY_LIMIT && (
                <div className="msg-skip">
                  ⚠ WhatsApp currently allows {DAILY_LIMIT} different parents per 24 hours. Messages over the limit will show “Failed”; use <em>Retry failed</em> the next day.
                </div>
              )}
            </div>
          )}

          <div className="msg-send">
            <button className="btn btn-whatsapp" disabled={!canSend || sending} onClick={() => setConfirm(true)}>
              💬 Send on WhatsApp{preview?.parents ? ` (${preview.parents})` : ''}
            </button>
          </div>
        </div>

        {/* ── Preview ── */}
        <div className="msg-preview-col">
          <p className="msg-preview-label">Preview: what parents see</p>
          <div className="msg-phone">
            <div className="msg-bubble">
              <div className="msg-bubble-head">School Notice</div>
              <div className="msg-bubble-text">{previewText(title.trim(), body)}</div>
              <div className="msg-bubble-foot">Matha English Medium School</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── History ── */}
      <div className="data-card" style={{ padding: 20, marginTop: 18 }}>
        <h3 className="msg-h">Sent messages</h3>
        {notices.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <p className="empty-state-text">No messages sent yet.</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Subject</th><th>Sent to</th><th>Parents</th><th>Delivered</th><th>Failed</th><th></th></tr>
              </thead>
              <tbody>
                {notices.map(n => (
                  <tr key={n.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatWhen(n.createdAt)}</td>
                    <td><strong>{n.title}</strong><div className="msg-muted msg-clip">{n.body}</div></td>
                    <td>{audienceLabel(n.audience, classNames)}</td>
                    <td>{n.total}{n.counts.queued > 0 && <div className="msg-muted">⏳ {n.counts.queued} sending</div>}</td>
                    <td>{n.counts.delivered + n.counts.read}{n.counts.read > 0 && <div className="msg-muted">👁 {n.counts.read} read</div>}</td>
                    <td>{n.counts.failed > 0 ? <span className="badge badge-red">{n.counts.failed}</span> : '0'}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" disabled={busy[`view-${n.id}`]} onClick={() => view(n.id)}>
                        {busy[`view-${n.id}`] ? <span className="spinner spinner-dark" /> : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Confirm send ── */}
      {confirm && (
        <div className="modal-overlay" onClick={() => !sending && setConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header"><h3 className="modal-title">Send this message?</h3></div>
            <div className="modal-body">
              <p>“<strong>{title.trim()}</strong>” will be sent to <strong>{preview?.parents}</strong> parent{preview?.parents === 1 ? '' : 's'} ({audienceLabel(audience, classNames)}).</p>
              <p className="msg-muted">Each message costs a small amount from your RichAutomate wallet. Messages can't be taken back once sent.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" disabled={sending} onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-whatsapp" disabled={sending} onClick={send}>
                {sending ? <><span className="spinner" /> Sending…</> : '💬 Yes, send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── One notice: every parent's status ── */}
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(null)}>
          <div className="modal msg-detail" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3 className="modal-title">{open.title}</h3>
              <button className="modal-close" onClick={() => setOpen(null)} aria-label="Close">✕</button>
            </div>
            <div className="modal-body">
              <p className="msg-muted">{formatWhen(open.createdAt)} · {audienceLabel(open.audience, classNames)}</p>
              <p className="msg-detail-body">{open.body}</p>
              <div className="msg-detail-actions">
                <div className="sp-chips">
                  {['queued', 'sent', 'delivered', 'read', 'failed'].filter(s => open.counts[s] > 0).map(s => (
                    <span key={s} className={`badge badge-${waLabel(s).tone}`}>{waLabel(s).icon} {open.counts[s]} {waLabel(s).text}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" disabled={busy.refresh} onClick={() => action(open.id, 'refresh')}>
                    {busy.refresh ? <span className="spinner spinner-dark" /> : '↻ Refresh delivery'}
                  </button>
                  <button className="btn btn-whatsapp btn-sm" disabled={busy.retry || !open.counts.failed || !configured} onClick={() => action(open.id, 'retry')}>
                    {busy.retry ? <span className="spinner" /> : `↻ Retry failed (${open.counts.failed})`}
                  </button>
                </div>
              </div>
              <div className="data-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Parent of</th><th>Number</th><th>Status</th></tr></thead>
                  <tbody>
                    {open.messages.map(m => {
                      const label = waLabel(m.status);
                      return (
                        <tr key={m.id}>
                          <td>{m.students}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatPhone(m.phone.replace(/^91/, ''))}</td>
                          <td>
                            {label && <span className={`badge badge-${label.tone}`}>{label.icon} {label.text}</span>}
                            {m.status === 'failed' && m.error && <div className="cr-error">{m.error}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
