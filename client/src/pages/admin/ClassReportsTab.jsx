import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { downloadReports } from '../../components/report/downloadReport';
import { gradeTone } from '../../utils/grades';
import { SCHOOL } from '../../utils/school';
import { waLabel, waPending, formatPhone } from '../../utils/whatsappStatus';
import '../students/StudentProfile.css';

const SENT = ['sent', 'delivered', 'read'];

/** Same text as the approved WhatsApp template, filled in for one student (for the preview). */
function messagePreview(report, r) {
  const marks = report.subjects.map((s, i) => `${s.name} ${r.subjects[i].total ?? 'AB'}/${s.maxMarks}`).join(', ');
  return `Dear Parent,\nThe results of ${r.student.name} (${report.class.name}, Roll No. ${r.student.rollNumber}) for ${report.exam.name} have been published by ${SCHOOL.name}.\n\nMarks: ${marks}\nTotal: ${r.total}/${r.maxTotal} | Percentage: ${r.percentage}% | Grade: ${r.grade}\n\nFor any questions, please contact the class teacher.`;
}

/** Why a student would be skipped by a whole-class send (null = will be sent). */
function skipReason(r, msg, resend) {
  if (!r.student.parentPhone) return 'No parent number';
  if (!r.complete) return 'Marks not complete';
  if (waPending(msg?.status)) return 'Already sending';
  if (!resend && SENT.includes(msg?.status)) return 'Already sent';
  return null;
}

export default function ClassReportsTab({ cls }) {
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [exams, setExams]       = useState(null);
  const [examId, setExamId]     = useState('');
  const [report, setReport]     = useState(null);
  const [messages, setMessages] = useState({});
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [busy, setBusy]         = useState({});
  const [confirm, setConfirm]   = useState(false);   // whole-class send dialog
  const [resend, setResend]     = useState(false);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 6000); };

  useEffect(() => {
    apiCall(`/api/students/class/${cls.id}/exams`)
      .then(res => { setExams(res.exams); if (res.exams[0]) setExamId(String(res.exams[0].id)); })
      .catch(e => setError(e.message));
  }, [apiCall, cls.id]);

  const loadStatus = useCallback(async () => {
    if (!examId) return;
    const res = await apiCall(`/api/admin/whatsapp/status?examId=${examId}&classId=${cls.id}`);
    setMessages(res.messages);
    setConfigured(res.configured);
  }, [apiCall, examId, cls.id]);

  useEffect(() => {
    if (!examId) return;
    setLoading(true); setError('');
    Promise.all([apiCall(`/api/students/reports/exams/${examId}/classes/${cls.id}`), loadStatus()])
      .then(([rep]) => setReport(rep))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiCall, examId, cls.id, loadStatus]);

  // Keep checking while messages are still sending.
  useEffect(() => {
    if (!Object.values(messages).some(m => waPending(m?.status))) return;
    const t = setTimeout(() => loadStatus().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [messages, loadStatus]);

  const setBusyKey = (k, v) => setBusy(b => ({ ...b, [k]: v }));

  const downloadAll = async () => {
    setBusyKey('all', true);
    try {
      const pages = await downloadReports(apiCall, { examId, classId: cls.id });
      flash(`✅ Downloaded ${pages} reports — one page per student.`);
    } catch (e) { flash(`⚠ ${e.message}`); }
    finally { setBusyKey('all', false); }
  };

  const downloadOne = async (studentId) => {
    setBusyKey(`pdf-${studentId}`, true);
    try { await downloadReports(apiCall, { examId, classId: cls.id, studentId }); }
    catch (e) { flash(`⚠ ${e.message}`); }
    finally { setBusyKey(`pdf-${studentId}`, false); }
  };

  const send = async (studentIds, again) => {
    const key = studentIds ? `wa-${studentIds[0]}` : 'class';
    setBusyKey(key, true);
    try {
      const res = await apiCall('/api/admin/whatsapp/send', {
        method: 'POST',
        body: { examId: Number(examId), classId: cls.id, ...(studentIds ? { studentIds } : {}), resend: again },
      });
      if (res.queued) flash(`📤 Sending ${res.queued} message${res.queued === 1 ? '' : 's'} on WhatsApp…${res.skipped.length ? ` (${res.skipped.length} skipped)` : ''}`);
      else flash(`⚠ Nothing sent: ${res.skipped[0]?.reason || 'no eligible students'}`);
      await loadStatus();
    } catch (e) { flash(`⚠ ${e.message}`); }
    finally { setBusyKey(key, false); setConfirm(false); }
  };

  const refresh = async () => {
    setBusyKey('refresh', true);
    try {
      const res = await apiCall('/api/admin/whatsapp/refresh', { method: 'POST', body: { examId: Number(examId), classId: cls.id } });
      await loadStatus();
      flash(res.updated ? `✅ ${res.updated} delivery status${res.updated === 1 ? '' : 'es'} updated.` : 'Delivery status is up to date.');
    } catch (e) { flash(`⚠ ${e.message}`); }
    finally { setBusyKey('refresh', false); }
  };

  if (exams === null) return <div className="tab-content"><div className="spinner spinner-dark" /></div>;
  if (exams.length === 0) return (
    <div className="tab-content"><div className="empty-state" style={{ padding: '32px 0' }}>
      <p className="empty-state-icon">📄</p>
      <p className="empty-state-text">No exams for {cls.name} yet. Reports appear here once an exam is published for this class.</p>
    </div></div>
  );

  const results = report?.results || [];
  const withPhone = results.filter(r => r.student.parentPhone).length;
  const complete = results.filter(r => r.complete).length;
  const sentCount = results.filter(r => SENT.includes(messages[r.student.id]?.status)).length;
  const plan = results.map(r => ({ r, reason: skipReason(r, messages[r.student.id], resend) }));
  const toSend = plan.filter(p => !p.reason);
  const skipped = plan.filter(p => p.reason);
  const preview = toSend[0] ? messagePreview(report, toSend[0].r) : null;

  return (
    <div className="tab-content">
      <div className="tab-section-header">
        <div>
          <h3>Progress Reports &amp; WhatsApp</h3>
          <p className="tab-desc">Download report cards and send results to parents for {cls.name}.</p>
        </div>
        <select className="form-select" style={{ maxWidth: 280 }} value={examId} onChange={e => setExamId(e.target.value)} aria-label="Exam">
          {exams.map(e => <option key={e.id} value={e.id}>{e.name}{e.status === 'Closed' ? ' (finalized)' : ''}</option>)}
        </select>
      </div>

      {notice && <div className={`alert ${notice.startsWith('⚠') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{notice}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {!configured && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          ℹ️ WhatsApp sending isn't set up yet — add <code>RICHAUTOMATE_API_KEY</code> in Render → Environment. Reports can still be downloaded.
        </div>
      )}

      {loading || !report ? <div className="spinner spinner-dark" /> : (
        <>
          <div className="cr-toolbar">
            <div className="sp-chips">
              <span className="badge badge-gray">{results.length} students</span>
              <span className={`badge ${complete === results.length ? 'badge-green' : 'badge-amber'}`}>{complete} with complete marks</span>
              <span className={`badge ${withPhone === results.length ? 'badge-green' : 'badge-amber'}`}>{withPhone} with parent number</span>
              <span className="badge badge-blue">{sentCount} sent on WhatsApp</span>
            </div>
            <div className="cr-actions">
              <button className="btn btn-primary btn-sm" disabled={busy.all || !results.length} onClick={downloadAll}>
                {busy.all ? <><span className="spinner" /> Preparing…</> : `⬇ Download all reports (${results.length})`}
              </button>
              <button className="btn btn-whatsapp btn-sm" disabled={!configured || busy.class} onClick={() => { setResend(false); setConfirm(true); }}>
                💬 Send to whole class
              </button>
              <button className="btn btn-ghost btn-sm" disabled={!configured || busy.refresh || !sentCount} onClick={refresh}>
                {busy.refresh ? <span className="spinner spinner-dark" /> : '↻ Refresh delivery'}
              </button>
            </div>
          </div>

          <div className="data-table-wrap">
            <table className="data-table cr-table">
              <thead>
                <tr><th>#</th><th>Student</th><th>Parent cell</th><th>Total</th><th>%</th><th>Grade</th><th>GPA</th><th>WhatsApp</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const msg = messages[r.student.id];
                  const label = waLabel(msg?.status);
                  const again = SENT.includes(msg?.status);
                  return (
                    <tr key={r.student.id}>
                      <td className="cr-muted">{i + 1}</td>
                      <td>
                        <button className="cr-link" onClick={() => navigate(`/admin/students/${r.student.id}`)}>{r.student.name}</button>
                        <div className="cr-muted">Roll {r.student.rollNumber}</div>
                      </td>
                      <td>{r.student.parentPhone ? formatPhone(r.student.parentPhone) : <span className="badge badge-red">Missing</span>}</td>
                      <td>{r.complete ? `${r.total}/${r.maxTotal}` : <span className="badge badge-amber">Incomplete</span>}</td>
                      <td>{r.percentage ?? '—'}</td>
                      <td>{r.grade ? <span className={`badge badge-${gradeTone(r.grade)}`}>{r.grade}</span> : '—'}</td>
                      <td>{r.gpa ?? '—'}</td>
                      <td>
                        {label ? <span className={`badge badge-${label.tone}`} title={msg.error || ''}>{label.icon} {label.text}</span> : <span className="cr-muted">Not sent</span>}
                        {msg?.status === 'failed' && msg.error && <div className="cr-error">{msg.error}</div>}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-ghost btn-sm" disabled={busy[`pdf-${r.student.id}`]} onClick={() => downloadOne(r.student.id)} title="Download this student's report">
                            {busy[`pdf-${r.student.id}`] ? <span className="spinner spinner-dark" /> : '⬇'}
                          </button>
                          <button
                            className="btn btn-whatsapp btn-sm"
                            disabled={!configured || busy[`wa-${r.student.id}`] || waPending(msg?.status) || !r.complete || !r.student.parentPhone}
                            title={!r.student.parentPhone ? 'Add the parent cell number first' : !r.complete ? 'Marks are not complete' : again ? 'Send again' : 'Send on WhatsApp'}
                            onClick={() => (again ? window.confirm(`Send ${r.student.name}'s result again?`) && send([r.student.id], true) : send([r.student.id], false))}
                          >
                            {busy[`wa-${r.student.id}`] ? <span className="spinner" /> : again ? '↻' : '💬'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirm && report && (
        <div className="modal-overlay" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2 className="modal-title">Send results to {cls.name} parents</h2>
              <button className="modal-close" onClick={() => setConfirm(false)}>✕</button>
            </div>
            <p style={{ fontSize: '0.88rem', marginBottom: 10 }}>
              <strong>{toSend.length}</strong> parent{toSend.length === 1 ? '' : 's'} will get their child's <strong>{report.exam.name}</strong> result on WhatsApp
              {skipped.length > 0 && <>; <strong>{skipped.length}</strong> will be skipped</>}.
            </p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem', marginBottom: 12 }}>
              <input type="checkbox" checked={resend} onChange={e => setResend(e.target.checked)} />
              Also send again to parents who already received it
            </label>
            {preview && (
              <>
                <p className="form-label">Message preview ({toSend[0].r.student.name})</p>
                <pre className="cr-preview">{preview}</pre>
              </>
            )}
            {skipped.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Skipped students ({skipped.length})</summary>
                <ul className="cr-skip-list">
                  {skipped.map(({ r, reason }) => <li key={r.student.id}>{r.student.name} — <span className="cr-muted">{reason}</span></li>)}
                </ul>
              </details>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="btn btn-whatsapp" disabled={!toSend.length || busy.class} onClick={() => send(null, resend)}>
                {busy.class ? <span className="spinner" /> : `Send ${toSend.length} message${toSend.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
