import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { thisMonth, monthLabel } from './tuition';
import '../admin/admin.css';
import '../admin/Exams.css';
import './Tuition.css';

/**
 * Tuition → Messages to parents: tuition parents only.
 * Families using the Student App get a free notification; the others get WhatsApp.
 */
export default function TuitionMessagesPage() {
  const { apiCall } = useApi();
  const unpaidFrom = new URLSearchParams(window.location.search).get('unpaid');
  const [type, setType] = useState(unpaidFrom ? 'unpaid' : 'all');   // all | classes | unpaid
  const [month] = useState(unpaidFrom || thisMonth());
  const [classIds, setClassIds] = useState([]);
  const [classes, setClasses] = useState([]);
  const [title, setTitle] = useState(unpaidFrom ? 'Tuition fee reminder' : '');
  const [body, setBody] = useState(unpaidFrom ? `Dear parent, the tuition fee for ${monthLabel(unpaidFrom)} is still pending. Please pay at the earliest. Thank you.` : '');
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const audience = type === 'classes' ? { type, classIds } : type === 'unpaid' ? { type, month } : { type: 'all' };
  const ready = type !== 'classes' || classIds.length > 0;

  const loadHistory = useCallback(() => apiCall('/api/tuition/messages').then(setHistory).catch(() => {}), [apiCall]);
  useEffect(() => {
    apiCall('/api/tuition/classes').then((d) => setClasses(d.classes)).catch(() => {});
    loadHistory();
  }, [apiCall, loadHistory]);
  useEffect(() => {
    if (!ready) { setPreview(null); return; }
    apiCall('/api/tuition/messages/recipients', { method: 'POST', body: { audience } }).then(setPreview).catch(() => setPreview(null));
  }, [apiCall, type, classIds.join(','), month]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!window.confirm(`Send "${title}" to ${preview?.parents ?? 0} parent${preview?.parents === 1 ? '' : 's'}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const d = await apiCall('/api/tuition/messages', { method: 'POST', body: { title, body, audience } });
      const parts = [];
      if (d.pushed) parts.push(`📱 ${d.pushed} by app notification (free)`);
      if (d.queued) parts.push(`💬 ${d.queued} on WhatsApp`);
      setNotice(`✅ Sent: ${parts.join(', ') || 'nobody'}.${d.whatsappOff ? ' WhatsApp is not set up, so only app families were told.' : ''}${d.skipped?.length ? ` ${d.skipped.length} student(s) have no parent number.` : ''}`);
      setTitle(''); setBody(''); loadHistory();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📢 Messages to tuition parents</h1>
          <p className="page-sub">Families using the Student App get a free notification; the others get WhatsApp.</p>
        </div>
      </div>
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}

      <div className="data-card" style={{ padding: 18, marginBottom: 16 }}>
        <label className="form-label">Send to</label>
        <div className="ex-tabs" style={{ marginBottom: 10 }}>
          {[['all', 'All tuition parents'], ['classes', 'Some tuition classes'], ['unpaid', `Not paid · ${monthLabel(month)}`]].map(([k, l]) => (
            <button key={k} className={`ex-tab${type === k ? ' ex-tab-on' : ''}`} onClick={() => setType(k)}>{l}</button>
          ))}
        </div>
        {type === 'classes' && (
          <div className="tu-chips" style={{ marginBottom: 10 }}>
            {classes.map((c) => (
              <label key={c.id} className="tu-chip" style={{ cursor: 'pointer', background: classIds.includes(c.id) ? '#fed7aa' : undefined }}>
                <input type="checkbox" checked={classIds.includes(c.id)} style={{ marginRight: 4 }}
                  onChange={() => setClassIds((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id]))} />{c.name}
              </label>
            ))}
          </div>
        )}
        {preview && <p className="tu-muted" style={{ marginBottom: 10 }}>👪 {preview.parents} parent{preview.parents === 1 ? '' : 's'} ({preview.students} student{preview.students === 1 ? '' : 's'}){preview.skipped?.length ? ` · ${preview.skipped.length} without a parent number` : ''}</p>}

        <div className="form-group">
          <label className="form-label">Subject</label>
          <input className="form-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tuition holiday on Monday" />
        </div>
        <div className="form-group">
          <label className="form-label">Message</label>
          <textarea className="form-textarea" rows={4} maxLength={700} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the message for parents…" />
        </div>
        <button className="btn btn-primary" disabled={busy || !ready || !title.trim() || !body.trim() || !preview?.parents} onClick={send}>
          {busy ? <span className="spinner" /> : `📢 Send${preview?.parents ? ` to ${preview.parents}` : ''}`}
        </button>
      </div>

      <h3 style={{ margin: '0 0 10px' }}>Sent messages</h3>
      {!history ? <div className="spinner spinner-dark" /> : history.notices.length === 0 ? (
        <p className="tu-muted">Nothing sent yet.</p>
      ) : (
        <div className="tu-grid">
          {history.notices.map((n) => (
            <div key={n.id} className="tu-card">
              <h3>{n.title}</h3>
              <p className="tu-muted" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
              <p className="tu-muted">{new Date(n.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                {n.total ? ` · WhatsApp: ${n.counts.sent + n.counts.delivered + n.counts.read} sent${n.counts.failed ? `, ${n.counts.failed} failed` : ''}` : ' · app notifications'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
