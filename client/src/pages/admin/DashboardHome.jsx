import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import './admin.css';

export default function DashboardHome() {
  const { apiCall } = useApi();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall('/api/admin/stats')
      .then(d => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
