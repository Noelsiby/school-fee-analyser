import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import AttendanceToday from '../../components/attendance/AttendanceToday';
import SubjectWatch from '../../components/analysis/SubjectWatch';
import '../../components/analysis/Analysis.css';
import './admin.css';

const formatSize = (bytes) => (bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
  : `${Math.max(0.1, bytes / 1024 ** 2).toFixed(1)} MB`);

const TABLE_LABELS = {
  marks: 'Marks', students: 'Students', student_photos: 'Student photos', whatsapp_messages: 'WhatsApp results',
  notice_messages: 'WhatsApp notices', audit_logs: 'Change history', notifications: 'Notifications',
  teacher_subject_assignments: 'Teacher assignments', exam_subject_configs: 'Exam settings', assistant_usage: 'Assistant usage',
};

/** How much database space the school's data uses (and of how much, when the plan size is set). */
function StorageMeter({ storage }) {
  const pct = storage.limitBytes ? Math.min(100, (storage.bytes / storage.limitBytes) * 100) : null;
  const tone = pct === null ? '#1E3A8A' : pct >= 90 ? '#dc2626' : pct >= 80 ? '#d97706' : '#16a34a';
  return (
    <div className="data-card" style={{ padding: 24, marginBottom: 20 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Database storage</h2>
      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
        <strong style={{ color: tone }}>{formatSize(storage.bytes)}</strong> used
        {storage.limitBytes ? <> of {formatSize(storage.limitBytes)} ({pct.toFixed(0)}%)</> : null}
      </p>
      {pct !== null && (
        <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(pct, 1)}%`, height: '100%', background: tone }} />
        </div>
      )}
      {pct !== null && pct >= 80 && (
        <p style={{ color: tone, fontSize: '0.85rem', marginTop: 8 }}>
          ⚠ Storage is getting full. Archive old data or move to a bigger plan soon.
        </p>
      )}
      <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 10, marginBottom: 0 }}>
        Biggest: {storage.tables.slice(0, 4).map(t => `${TABLE_LABELS[t.name] || t.name} ${formatSize(t.bytes)}`).join(' · ')}
      </p>
    </div>
  );
}

export default function DashboardHome() {
  const { apiCall } = useApi();
  const [stats, setStats]   = useState(null);
  const [storage, setStorage] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [risk, setRisk] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiCall('/api/analysis/at-risk').then(setRisk).catch(() => {});
    apiCall('/api/admin/stats')
      .then(d => setStats(d))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
    apiCall('/api/admin/storage').then(setStorage).catch(() => {});
  }, [apiCall]);

  const cards = [
    { icon: '👩‍🏫', label: 'Teachers',  key: 'teachers', color: '#1E3A8A' },
    { icon: '🏛️', label: 'Classes',   key: 'classes',  color: '#065f46' },
    { icon: '👦', label: 'Students',  key: 'students', color: '#7c3aed' },
    { icon: '📚', label: 'Subjects',  key: 'subjects', color: '#c2410c' },
  ];

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Welcome back! Here's a snapshot of the school.</p>
        </div>
      </div>

      {loadError && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠ {loadError}</div>}

      <div className="stats-grid-admin">
        {cards.map(({ icon, label, key, color }) => (
          <div key={key} className="stat-card-admin" style={{ '--accent-color': color }}>
            <span className="stat-card-icon">{icon}</span>
            <div>
              <p className="stat-card-value">
                {loading ? '—' : (stats?.[key] ?? '0')}
              </p>
              <p className="stat-card-label">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="data-card an-card" style={{ marginBottom: 20 }}>
        <AttendanceToday compact onOpen={() => navigate('/admin/attendance')} />
      </div>

      {risk && risk.students.length > 0 && (
        <div className="data-card an-card" style={{ marginBottom: 20 }}>
          <div className="an-head" style={{ marginBottom: 0 }}>
            <div>
              <h3>⚠️ At-risk students</h3>
              <p className="an-sub">
                <strong>{risk.high}</strong> with low marks <em>and</em> low attendance · {risk.students.length - risk.high} more to watch
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/at-risk')}>See the list →</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}><SubjectWatch profileBase="/admin/students" /></div>

      {storage && <StorageMeter storage={storage} />}

      <div className="data-card" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
          Quick Navigation
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
          {[
            { href: '/admin/classes',  icon: '🏛️', label: 'Manage Classes'  },
            { href: '/admin/teachers', icon: '👩‍🏫', label: 'Manage Teachers' },
            { href: '/admin/students', icon: '👦', label: 'Manage Students' },
            { href: '/admin/exams',    icon: '📝', label: 'Manage Exams'    },
          ].map(({ href, icon, label }) => (
            <a
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', borderRadius: 8,
                background: '#f8fafc', border: '1px solid #e2e8f0',
                textDecoration: 'none', color: '#334155',
                fontSize: '0.84rem', fontWeight: 600,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
              onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
            >
              <span style={{ fontSize: '1.2rem' }}>{icon}</span>
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
