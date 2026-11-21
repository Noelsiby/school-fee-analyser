import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import AttendanceToday from '../../components/attendance/AttendanceToday';
import SubjectWatch from '../../components/analysis/SubjectWatch';
import '../../components/analysis/Analysis.css';
import './admin.css';
import './Exams.css';
import './AdminHome.css';

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

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Classes of an exam and how many are finalized. */
function examProgress(exam) {
  const list = exam.examType === 'INTERNAL_EXAM'
    ? (exam.enrollments || []).map((e) => e.status === 'Finalized' || exam.status === 'Closed')
    : [exam.status === 'Closed'];
  return { total: list.length, done: list.filter(Boolean).length };
}

export default function DashboardHome() {
  const { apiCall } = useApi();
  const { user } = useAuth();
  const [stats, setStats]   = useState(null);
  const [storage, setStorage] = useState(null);
  const [exams, setExams] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [risk, setRisk] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    apiCall('/api/analysis/at-risk').then(setRisk).catch(() => {});
    apiCall('/api/admin/exams').then((d) => setExams(d.exams)).catch(() => setExams([]));
    apiCall('/api/admin/stats')
      .then(d => setStats(d))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
    apiCall('/api/admin/storage').then(setStorage).catch(() => {});
  }, [apiCall]);

  const cards = [
    { icon: '👦', label: 'Students', key: 'students', color: '#7c3aed', to: '/admin/students' },
    { icon: '🏛️', label: 'Classes',  key: 'classes',  color: '#065f46', to: '/admin/classes' },
    { icon: '👩‍🏫', label: 'Teachers', key: 'teachers', color: '#1E3A8A', to: '/admin/teachers' },
    { icon: '📚', label: 'Subjects', key: 'subjects', color: '#c2410c', to: '/admin/subjects' },
  ];
  const actions = [
    { icon: '📝', label: 'Create exam', to: '/admin/exams' },
    { icon: '✅', label: 'Attendance', to: '/admin/attendance' },
    { icon: '📢', label: 'Send a message', to: '/admin/messages' },
    { icon: '📷', label: 'Photo day', to: '/admin/photo-day' },
    { icon: '📱', label: 'Student App', to: '/admin/student-app' },
  ];
  const running = (exams || []).filter((e) => e.status === 'Open' || (e.status === 'Closed' && !e.isPublished));
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

  return (
    <div className="admin-page">
      {/* Welcome + quick actions */}
      <div className="db-hero">
        <div>
          <p className="db-date">{today}</p>
          <h1 className="db-hello">{greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋</h1>
          <p className="db-sub">Here's what's happening at Matha English Medium School today.</p>
        </div>
        <div className="db-actions">
          {actions.map((a) => (
            <button key={a.to} className="db-action" onClick={() => navigate(a.to)}>
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠ {loadError}</div>}

      <div className="stats-grid-admin db-stats">
        {cards.map(({ icon, label, key, color, to }) => (
          <button key={key} className="stat-card-admin db-stat" style={{ '--accent-color': color }} onClick={() => navigate(to)}>
            <span className="stat-card-icon">{icon}</span>
            <div>
              <p className="stat-card-value">{loading ? '—' : (stats?.[key] ?? '0')}</p>
              <p className="stat-card-label">{label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Exams that need attention */}
      <div className="data-card an-card" style={{ marginBottom: 20 }}>
        <div className="an-head">
          <div>
            <h3>📝 Exams in progress</h3>
            <p className="an-sub">Marks being entered, or finalized and waiting to be published to parents.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/exams')}>All exams →</button>
        </div>
        {exams === null ? <div className="spinner spinner-dark" /> : running.length === 0 ? (
          <p className="an-muted" style={{ margin: 0 }}>No exams running right now. <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/exams')}>＋ Create an exam</button></p>
        ) : (
          <div className="db-exams">
            {running.slice(0, 5).map((e) => {
              const { total, done } = examProgress(e);
              const pct = total ? Math.round((done / total) * 100) : 0;
              const ready = e.status === 'Closed' || (total > 0 && done === total);
              return (
                <button key={e.id} className="db-exam" onClick={() => navigate(`/admin/exams/${e.id}/results`)}>
                  <div className="db-exam-top">
                    <strong>{e.name}</strong>
                    <span className={`badge ${ready ? 'badge-blue' : 'badge-green'}`}>{ready ? '✅ Ready to publish' : '✍️ Marks entry'}</span>
                  </div>
                  <div className="ex-bar"><div style={{ width: `${pct}%` }} /></div>
                  <span className="an-muted">{done} of {total} class{total === 1 ? '' : 'es'} finalized</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="data-card an-card" style={{ marginBottom: 20 }}>
        <AttendanceToday compact onOpen={() => navigate('/admin/attendance')} />
      </div>

      {risk && risk.students.length > 0 && (
        <div className="data-card an-card db-risk" style={{ marginBottom: 20 }}>
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
    </div>
  );
}
