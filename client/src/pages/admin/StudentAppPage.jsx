import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import { byClassName } from '../../components/SubjectFields';
import { waLabel } from '../../utils/whatsappStatus';
import './admin.css';
import '../students/StudentProfile.css';
import '../../components/analysis/Analysis.css';
import '../../components/attendance/Attendance.css';

const STATUS = {
  none:    { text: 'Not invited', badge: 'badge-gray' },
  expired: { text: 'Code expired', badge: 'badge-amber' },
  invited: { text: 'Invited', badge: 'badge-blue' },
  active:  { text: '✅ Using the app', badge: 'badge-green' },
};
const when = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/**
 * Admin → 📱 Student App: invite parents (printed slips with QR code and/or WhatsApp),
 * see who is using the app, and reset a family's PIN.
 * One family = one parent mobile number (brothers and sisters together).
 */
export default function StudentAppPage() {
  const { apiCall } = useApi();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState([]);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { apiCall('/api/admin/classes').then((d) => setClasses([...d.classes].sort(byClassName))).catch(() => {}); }, [apiCall]);

  const load = useCallback(async () => {
    const d = await apiCall(`/api/admin/app/families${classId ? `?classId=${classId}` : ''}`);
    setData(d);
    setLink((l) => l || d.settings.downloadUrl || '');
  }, [apiCall, classId]);
  useEffect(() => { setPicked([]); load().catch((e) => setError(e.message)); }, [load]);

  // Keep WhatsApp invite statuses fresh while they go out
  useEffect(() => {
    if (!data?.families.some((f) => f.inviteStatus === 'queued')) return;
    const t = setTimeout(() => load().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, [data, load]);

  const rows = useMemo(() => (data ? data.families.filter((f) => filter === 'all'
    || (filter === 'not' ? f.status === 'none' || f.status === 'expired' : f.status === filter)) : []), [data, filter]);
  const allPicked = rows.length > 0 && rows.every((f) => picked.includes(f.phone));

  const saveLink = async () => {
    setError('');
    try {
      await apiCall('/api/admin/app/settings', { method: 'PUT', body: { downloadUrl: link } });
      setNotice('✅ Download link saved.'); await load();
    } catch (e) { setError(e.message); }
  };

  const printSlips = async (invites, name) => {
    const { downloadInviteSlips } = await import('../../components/studentApp/inviteSlips');
    await downloadInviteSlips(invites, data.settings.downloadUrl, name);
  };

  const invite = async (sendWhatsApp) => {
    const phones = picked.length ? picked : rows.filter((f) => f.status !== 'active').map((f) => f.phone);
    if (!phones.length) { setError('Everyone shown is already using the app.'); return; }
    if (sendWhatsApp && !window.confirm(`Send the app invite on WhatsApp to ${phones.length} famil${phones.length === 1 ? 'y' : 'ies'}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const d = await apiCall('/api/admin/app/invites', { method: 'POST', body: { phones, sendWhatsApp } });
      if (d.invites.length) {
        const cls = classes.find((c) => String(c.id) === classId);
        await printSlips(d.invites, `App_invites_${cls ? cls.name : 'school'}`);
      }
      setNotice(`✅ ${d.invites.length} invite${d.invites.length === 1 ? '' : 's'} created. The slips PDF has downloaded: print it and hand the slips out.`
        + (sendWhatsApp ? ' WhatsApp invites are being sent.' : '')
        + (d.skippedActive ? ` ${d.skippedActive} famil${d.skippedActive === 1 ? 'y is' : 'ies are'} already using the app and ${d.skippedActive === 1 ? 'was' : 'were'} skipped.` : '')
        + ' New codes replace any older ones.');
      setPicked([]);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const reset = async (f) => {
    if (!window.confirm(`Reset the app for ${f.display} (${f.children.map((c) => c.name).join(', ')})? Their PIN stops working and they are signed out. A new slip with a new code downloads to give them.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const d = await apiCall(`/api/admin/app/families/${f.phone}/reset`, { method: 'POST', body: {} });
      await printSlips(d.invites, `App_reset_${f.display.replace(/\s/g, '')}`);
      setNotice(`✅ Reset done for ${f.display}. Give them the new slip; they activate again with the new code and choose a new PIN.`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Student App</h1>
          <p className="page-sub">Invite parents, see who is using the app, and reset a PIN. One family = one parent mobile number, so brothers and sisters share one login.</p>
        </div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}

      {!data ? <div className="spinner spinner-dark" /> : (
        <>
          <div className="an-stats">
            <div className="an-stat"><strong>{data.totals.families}</strong><span>Families</span></div>
            <div className="an-stat"><strong>{data.totals.active}</strong><span>Using the app</span></div>
            <div className="an-stat"><strong>{data.totals.invited}</strong><span>Invited, not yet</span></div>
            <div className="an-stat"><strong>{data.totals.notInvited}</strong><span>Not invited</span></div>
          </div>

          <div className="data-card an-card">
            <h3 style={{ marginTop: 0 }}>App download link</h3>
            <p className="an-sub" style={{ marginBottom: 8 }}>The Play Store link of the school's app. It's printed as a QR code on the slips and sent in WhatsApp invites.</p>
            <div className="at-toolbar" style={{ marginBottom: 0 }}>
              <input className="form-input" style={{ flex: 1, minWidth: 260 }} placeholder="https://play.google.com/store/apps/details?id=…" value={link}
                onChange={(e) => setLink(e.target.value)} aria-label="App download link" />
              <button className="btn btn-primary btn-sm" disabled={link === (data.settings.downloadUrl || '')} onClick={saveLink}>Save link</button>
            </div>
            {!data.settings.downloadUrl && <p className="an-muted" style={{ marginBottom: 0 }}>Not set yet: slips will be printed without the QR code until the app is on the Play Store.</p>}
          </div>

          <div className="data-card an-card">
            <div className="an-toolbar">
              <select className="form-select" value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
                <option value="">Whole school</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="form-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
                <option value="all">All families ({data.families.length})</option>
                <option value="not">Not invited / expired</option>
                <option value="invited">Invited, not activated</option>
                <option value="active">Using the app</option>
              </select>
              <div style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => invite(false)}>
                {busy ? <span className="spinner" /> : `🖨 Create invites & print slips${picked.length ? ` (${picked.length})` : ''}`}
              </button>
              <button className="btn btn-whatsapp btn-sm" disabled={busy || !data.waConfigured || !data.settings.downloadUrl} onClick={() => invite(true)}
                title={!data.settings.downloadUrl ? 'Add the download link first' : !data.waConfigured ? 'WhatsApp is not set up' : ''}>
                💬 Also send on WhatsApp
              </button>
            </div>
            <p className="an-muted" style={{ marginTop: 0 }}>
              With nobody ticked, invites go to every family shown that isn't using the app yet. Families already using it are never sent a new code (use Reset for that).
            </p>

            {rows.length === 0 ? <p className="an-muted">No families here.</p> : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? [] : rows.map((f) => f.phone))} aria-label="Select all" /></th>
                      <th>Children</th><th>Parent number</th><th>Status</th><th>Invited</th><th>Last used</th><th></th>
                    </tr>
                  </thead>
                  <tbody>{rows.map((f) => {
                    const st = STATUS[f.status];
                    const wl = waLabel(f.inviteStatus);
                    return (
                      <tr key={f.phone}>
                        <td><input type="checkbox" checked={picked.includes(f.phone)} onChange={() => setPicked((p) => (p.includes(f.phone) ? p.filter((x) => x !== f.phone) : [...p, f.phone]))} aria-label={`Select ${f.display}`} /></td>
                        <td>{f.children.map((c) => <div key={c.id}><strong>{c.name}</strong> <span className="an-muted">{c.className} · Roll {c.rollNumber}</span></div>)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{f.display}</td>
                        <td>
                          <span className={`badge ${st.badge}`}>{st.text}</span>
                          {wl && <div style={{ marginTop: 3 }}><span className={`badge badge-${wl.tone}`} title={f.inviteError || ''}>{wl.icon} WhatsApp {wl.text}</span></div>}
                        </td>
                        <td>{when(f.invitedAt)}</td>
                        <td>{f.status === 'active' ? when(f.lastLoginAt) : '—'}</td>
                        <td>{f.status === 'active' && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => reset(f)}>↺ Reset PIN</button>}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>

          {data.noPhone.length > 0 && (
            <div className="data-card an-card">
              <h3 style={{ marginTop: 0 }}>⚠ Students without a valid parent number ({data.noPhone.length})</h3>
              <p className="an-sub" style={{ marginBottom: 8 }}>They can't use the app until a 10-digit mobile number is added as "Parent Cell" in their profile.</p>
              <p style={{ margin: 0 }}>{data.noPhone.map((s) => `${s.name} (${s.className})`).join(', ')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
