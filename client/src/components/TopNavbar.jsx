import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import './TopNavbar.css';

/** onMenu: open the phone menu (☰). onSearch: open the search window. */
export default function TopNavbar({ onMenu, onSearch, searchHint = 'Search…' } = {}) {
  const { apiCall } = useApi();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const data = await apiCall('/api/notifications');
      setNotifications(data.notifications || []);
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id) => {
    try {
      await apiCall(`/api/notifications/${id}/read`, { method: 'PUT' });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
    } catch (e) {
      console.error('Failed to mark read:', e);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="top-navbar">
      {onMenu && <button className="sh-menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>}
      {onSearch ? (
        <button className="sh-search-btn" onClick={onSearch} aria-label="Search">
          <span aria-hidden="true">🔎</span><span>{searchHint}</span><kbd>Ctrl K</kbd>
        </button>
      ) : <div className="topbar-spacer" />}
      <div className="topbar-spacer" />
      <div className="notification-wrapper">
        <button className="bell-btn" onClick={() => setIsOpen(!isOpen)}>
          🔔
          {unreadCount > 0 && <span className="badge-count">{unreadCount}</span>}
        </button>

        {isOpen && (
          <div className="notification-dropdown">
            <div className="dropdown-header">
              <h4>Notifications</h4>
            </div>
            <div className="dropdown-body">
              {notifications.length === 0 ? (
                <p className="no-notifications">No notifications yet.</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className={`notification-item ${n.isRead ? 'read' : 'unread'}`} onClick={() => { if (!n.isRead) markAsRead(n.id); }}>
                    <div className="notification-icon">{n.type === 'Alert' ? '🚨' : 'ℹ️'}</div>
                    <div className="notification-content">
                      <p className="notification-message">{n.message}</p>
                      <p className="notification-time">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                    {!n.isRead && <div className="unread-dot" />}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
