import { useNavigate } from 'react-router-dom';
import { useAuth, getRolePath } from '../contexts/AuthContext';
import './RoleSwitcherPage.css';

const ROLE_META = {
  Admin: {
    icon: '🛡️',
    label: 'Administrator',
    desc: 'Manage classes, subjects, teachers, and system settings.',
    color: '#1E3A8A',
    accent: '#F5B700',
  },
  ClassTeacher: {
    icon: '📋',
    label: 'Class Teacher',
    desc: 'Review and approve marks submitted for your class.',
    color: '#065f46',
    accent: '#34d399',
  },
  SubjectTeacher: {
    icon: '✏️',
    label: 'Subject Teacher',
    desc: 'Enter and manage marks for your assigned subjects.',
    color: '#7c3aed',
    accent: '#c4b5fd',
  },
};

export default function RoleSwitcherPage() {
  const { user, switchRole, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated || !user) {
    navigate('/login', { replace: true });
    return null;
  }

  const handleSelect = (role) => {
    switchRole(role);
    navigate(getRolePath(role), { replace: true });
  };

  return (
    <div className="switcher-root">
      <div className="switcher-card">
        <div className="switcher-header">
          <div className="switcher-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="switcher-title">Welcome, {user.name.split(' ')[0]}!</h1>
          <p className="switcher-subtitle">
            Your account has multiple roles. Choose how you'd like to continue.
          </p>
        </div>

        <div className="role-list">
          {user.roles.map((role) => {
            const meta = ROLE_META[role] || {};
            return (
              <button
                key={role}
                id={`role-btn-${role.toLowerCase()}`}
                className="role-card"
                style={{ '--role-color': meta.color, '--role-accent': meta.accent }}
                onClick={() => handleSelect(role)}
              >
                <span className="role-icon">{meta.icon}</span>
                <div className="role-text">
                  <span className="role-name">{meta.label}</span>
                  <span className="role-desc">{meta.desc}</span>
                </div>
                <span className="role-arrow">→</span>
              </button>
            );
          })}
        </div>

        <p className="switcher-note">
          You can switch roles anytime from the navigation menu.
        </p>
      </div>
    </div>
  );
}
