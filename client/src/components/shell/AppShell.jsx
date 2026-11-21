/**
 * The frame around every signed-in page (Admin, Class Teacher, Subject Teacher):
 * grouped menu on the left, top bar with search (Ctrl+K) and notifications.
 * On phones the menu slides in from the ☰ button and closes after choosing a page.
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, getRolePath } from '../../contexts/AuthContext';
import schoolLogo from '../../assets/school-logo.png';
import TopNavbar from '../TopNavbar';
import SearchPalette from './SearchPalette';
import '../../pages/admin/AdminLayout.css';
import './Shell.css';

const SWITCH_LABEL = { Admin: '🛡️ Admin', ClassTeacher: '📋 Class Teacher', SubjectTeacher: '✏️ Subject Teacher' };

/**
 * @param role       'Admin' | 'ClassTeacher' | 'SubjectTeacher' (the role these pages are for)
 * @param roleLabel  shown under the school name
 * @param sections   [{ title?, items: [{ path, label, icon }] }]
 * @param theme      { sidebar, accent, avatar } colours
 */
export default function AppShell({ role, roleLabel, sections, theme = {}, quickNew }) {
  const { user, logout, switchRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pages = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Close the phone menu after moving to another page
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Ctrl+K (or ⌘K) and "/" open search from anywhere
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  const handleSwitch = (r) => { switchRole(r); navigate(getRolePath(r), { replace: true }); };

  return (
    <div className="admin-shell">
      {menuOpen && <div className="sh-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside className={`admin-sidebar sh-sidebar${menuOpen ? ' sh-open' : ''}`} style={theme.sidebar ? { background: theme.sidebar } : undefined}>
        <div className="sb-brand">
          <img src={schoolLogo} alt="Matha School" className="sb-logo" />
          <div>
            <p className="sb-school">Matha School</p>
            <p className="sb-role" style={theme.accent ? { color: theme.accent } : undefined}>{roleLabel}</p>
          </div>
          <button className="sh-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button>
        </div>

        <nav className="sb-nav" aria-label="Main menu">
          {sections.map((sec, i) => (
            <div key={sec.title || i} className="sh-section">
              {sec.title && <p className="sh-section-title">{sec.title}</p>}
              {sec.items.map(({ path, label, icon }) => (
                <NavLink key={path} to={path} className={({ isActive }) => `sb-link${isActive ? ' active' : ''}`}>
                  <span className="sb-icon">{icon}</span>
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sb-bottom">
          {user?.roles?.length > 1 && (
            <div className="sb-role-switch">
              <p className="sb-switch-label">Switch role</p>
              {user.roles.filter((r) => r !== role).map((r) => (
                <button key={r} className="sb-switch-btn" onClick={() => handleSwitch(r)}>{SWITCH_LABEL[r] || r}</button>
              ))}
            </div>
          )}
          <div className="sb-user">
            <div className="sb-user-avatar" style={theme.avatar ? { background: theme.avatar } : undefined}>{user?.name?.charAt(0)}</div>
            <div className="sb-user-info">
              <p className="sb-user-name">{user?.name}</p>
              <p className="sb-user-email">{user?.email}</p>
            </div>
          </div>
          <button className="sb-logout" onClick={handleLogout}>⏻ Sign Out</button>
        </div>
      </aside>

      <main className="admin-main">
        <TopNavbar onMenu={() => setMenuOpen(true)} onSearch={() => setSearchOpen(true)} quickNew={quickNew} searchHint={role === 'SubjectTeacher' ? 'Search exams or subjects' : role === 'ClassTeacher' ? 'Search students or exams' : 'Search students, classes, exams…'} />
        <Outlet />
      </main>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} role={role} pages={pages} />
    </div>
  );
}
