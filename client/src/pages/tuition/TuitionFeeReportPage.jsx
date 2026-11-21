import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { rupees, monthLabel, shortMonth } from './tuition';
import '../admin/admin.css';
import '../admin/Exams.css';
import './Tuition.css';

/**
 * Tuition → Fees report: who owes money (all months since joining), the last 6 months,
 * and each class. Tick students and message their parents in one go.
 */
export default function TuitionFeeReportPage() {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { apiCall('/api/tuition/fees/analysis').then(setD).catch((e) => setError(e.message)); }, [apiCall]);

  if (error) return <div className="admin-page"><div className="alert alert-error">⚠ {error}</div></div>;
  if (!d) return <div className="admin-page"><div className="spinner spinner-dark" /></div>;
  const maxBar = Math.max(1, ...d.months.map((m) => m.due));
  const allPicked = d.owing.length > 0 && picked.length === d.owing.length;
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Fees report</h1>
          <p className="page-sub">Everything still owed since each student joined, and how collection is going.</p>
        </div>
      </div>

      <div className="tu-stats">
        <div className={`tu-stat ${d.totalOwed ? 'tu-warn' : 'tu-good'}`}><strong>{rupees(d.totalOwed)}</strong><span>Still owed (all months)</span></div>
        <div className={`tu-stat ${d.owing.length ? 'tu-warn' : 'tu-good'}`}><strong>{d.owing.length}</strong><span>Students who owe</span></div>
        <div className="tu-stat tu-good"><strong>{rupees(d.months[d.months.length - 1]?.collected)}</strong><span>Collected · {monthLabel(d.month)}</span></div>
      </div>

      <div className="tu-grid" style={{ marginBottom: 16 }}>
        <div className="tu-card" style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <h3>Last 6 months</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160, padding: '6px 4px 0' }}>
            {d.months.map((m) => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}
                title={`${monthLabel(m.month)}: ${rupees(m.collected)} of ${rupees(m.due)}`}>
                <span className="tu-muted" style={{ fontSize: '0.7rem' }}>{m.due ? `${Math.round((m.collected / m.due) * 100)}%` : ''}</span>
                <div style={{ width: '70%', height: `${(m.due / maxBar) * 100}%`, minHeight: 2, background: '#fed7aa', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${m.due ? Math.min(100, (m.collected / m.due) * 100) : 0}%`, background: '#16a34a' }} />
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{shortMonth(m.month)}</span>
              </div>
            ))}
          </div>
          <p className="tu-muted">Green: collected. Orange: still due.</p>
        </div>
        <div className="tu-card">
          <h3>This month by class</h3>
          {d.classes.map((c) => (
            <div key={c.name} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem' }}><strong>{c.name}</strong><span>{rupees(c.collected)} / {rupees(c.due)}</span></div>
              <div className="ex-bar"><div style={{ width: `${c.due ? Math.min(100, (c.collected / c.due) * 100) : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="tu-toolbar">
        <h3 style={{ margin: 0 }}>Who owes</h3>
        <div style={{ flex: 1 }} />
        {d.owing.length > 0 && (
          <>
            <button className="btn btn-ghost" disabled={!picked.length} onClick={() => navigate(`/tuition/messages?students=${picked.join(',')}`)}>📢 Message the {picked.length || ''} chosen</button>
            <button className="btn btn-primary" onClick={() => navigate('/tuition/messages?owing=1')}>📢 Remind everyone who owes ({d.owing.length})</button>
          </>
        )}
      </div>
      {d.owing.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 24 }}><p className="empty-state-text">🎉 Nobody owes any fees.</p></div></div>
      ) : (
        <div className="data-card tu-fee-list">
          <div className="tu-fee-row" style={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? [] : d.owing.map((o) => o.tuitionStudentId))} /> Student
            </label>
            <span>Fee</span><span>Owes</span><span>Months</span>
          </div>
          {d.owing.map((o) => (
            <div key={o.tuitionStudentId} className="tu-fee-row tu-unpaid">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                <input type="checkbox" checked={picked.includes(o.tuitionStudentId)} onChange={() => toggle(o.tuitionStudentId)} />
                <span className="tu-who">
                  <button className="link-btn" onClick={() => navigate(`/tuition/students/${o.tuitionStudentId}`)}>{o.name}</button>
                  <small>{o.tuitionClass} · School {o.schoolClass}{!o.hasPhone ? ' · ⚠ no parent number' : ''}</small>
                </span>
              </label>
              <span>{rupees(o.fee)}</span>
              <span className="tu-fee-amt" style={{ color: '#b45309' }}>{rupees(o.owed)}</span>
              <span className="tu-owe">{o.owedMonths.map(shortMonth).join(', ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
