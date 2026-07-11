import { useAuth, getRolePath } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import schoolLogo from '../../assets/school-logo.png';
import './Dashboard.css';

export default function AdminDashboard() {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  const handleSwitch = (role) => { switchRole(role); navigate(getRolePath(role), { replace: true }); };

  return (
    <div className="dashboard-root dashboard-admin">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src={schoolLogo} alt="Matha School" className="sidebar-logo-img" />
          <div>
            <p className="sidebar-school">Matha School</p>
            <p className="sidebar-role-tag">Administrator</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          <a href="#" className="nav-item active"><span>📊</span> Dashboard</a>
          <a href="#" className="nav-item"><span>👩‍🏫</span> Teachers</a>
          <a href="#" className="nav-item"><span>🏛️</span> Classes</a>
          <a href="#" className="nav-item"><span>📚</span> Subjects</a>
          <a href="#" className="nav-item"><span>📝</span> Exams</a>
          <a href="#" className="nav-item"><span>📈</span> Reports</a>
        </nav>
        {user?.roles?.length > 1 && (
          <div className="sidebar-role-switch">
            <p className="switch-label">Switch role</p>
            {user.roles.filter(r => r !== 'Admin').map(r => (
              <button key={r} className="switch-btn" onClick={() => handleSwitch(r)}>{r}</button>
            ))}
          </div>
        )}
        <button className="logout-btn" onClick={handleLogout}>⏻ Sign Out</button>
      </aside>

      <main className="dashboard-main">
        <header className="dash-header">
          <div>
            <h1 className="dash-title">Admin Dashboard</h1>
            <p className="dash-subtitle">Welcome back, {user?.name}</p>
          </div>
          <div className="user-chip">
            <span className="user-avatar">{user?.name?.charAt(0)}</span>
            <span>{user?.email}</span>
          </div>
        </header>

        <div className="stats-grid">
          {[
            { icon: '👩‍🏫', label: 'Teachers', value: '—', color: '#1E3A8A' },
            { icon: '🏛️', label: 'Classes', value: '—', color: '#065f46' },
            { icon: '📚', label: 'Subjects', value: '—', color: '#7c3aed' },
            { icon: '👦', label: 'Students', value: '—', color: '#c2410c' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ '--accent': s.color }}>
              <span className="stat-icon">{s.icon}</span>
              <div>
                <p className="stat-value">{s.value}</p>
                <p className="stat-label">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="placeholder-notice">
          <span>🚧</span>
          <div>
            <p className="notice-title">Admin features coming next</p>
            <p className="notice-body">Authentication is live. Exam management, teacher assignments, and reporting will be built in subsequent steps.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
