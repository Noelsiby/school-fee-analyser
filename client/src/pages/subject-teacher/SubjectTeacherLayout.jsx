import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, getRolePath } from '../../contexts/AuthContext';
import schoolLogo from '../../assets/school-logo.png';
import TopNavbar from '../../components/TopNavbar';
import '../admin/AdminLayout.css'; // Reuse admin layout styles for consistency

const NAV = [
  { path: '/subject-teacher/dashboard', label: 'Dashboard', icon: '📊' },
];

export default function SubjectTeacherLayout() {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  const handleSwitch = (role) => { switchRole(role); navigate(getRolePath(role), { replace: true }); };

  return (
    <div className="admin-shell">
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar" style={{ background: '#1e1b4b' }}> {/* Slightly different theme color for differentiation */}
        {/* Brand */}
        <div className="sb-brand">
          <img src={schoolLogo} alt="Matha School" className="sb-logo" />
          <div>
            <p className="sb-school">Matha School</p>
            <p className="sb-role" style={{ color: '#c7d2fe' }}>Subject Teacher</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sb-nav">
          {NAV.map(({ path, label, icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `sb-link${isActive ? ' active' : ''}`}
            >
              <span className="sb-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sb-bottom">
          {/* Role switcher (if multi-role) */}
          {user?.roles?.length > 1 && (
            <div className="sb-role-switch">
              <p className="sb-switch-label">Switch role</p>
              {user.roles
                .filter((r) => r !== 'SubjectTeacher')
                .map((r) => (
                  <button key={r} className="sb-switch-btn" onClick={() => handleSwitch(r)}>
                    {r === 'Admin' ? '🛡️ Admin' : '📋 Class Teacher'}
                  </button>
                ))}
            </div>
          )}

          {/* User chip */}
          <div className="sb-user">
            <div className="sb-user-avatar" style={{ background: '#4338ca' }}>{user?.name?.charAt(0)}</div>
            <div className="sb-user-info">
              <p className="sb-user-name">{user?.name}</p>
              <p className="sb-user-email">{user?.email}</p>
            </div>
          </div>

          <button className="sb-logout" onClick={handleLogout}>⏻ Sign Out</button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="admin-main">
        <TopNavbar />
        <Outlet />
      </main>
    </div>
  );
}
