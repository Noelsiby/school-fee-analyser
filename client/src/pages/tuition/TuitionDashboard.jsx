import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApi } from '../../hooks/useApi';
import TodoPanel from '../../components/shell/TodoPanel';
import { rupees, monthLabel } from './tuition';
import '../admin/admin.css';
import '../admin/AdminHome.css';
import './Tuition.css';

/** Tuition → Dashboard: this month's fees at a glance and what to do next. */
export default function TuitionDashboard() {
  const { user } = useAuth();
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [s, setS] = useState(null);

  useEffect(() => { apiCall('/api/tuition/summary').then(setS).catch(() => setS(null)); }, [apiCall]);

  return (
    <div className="admin-page">
      <div className="db-hero tu-hero">
        <div>
          <p className="db-date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</p>
          <h1 className="db-hello">Welcome, {user?.name?.split(' ').slice(0, 2).join(' ') || 'Tuition'} 👋</h1>
          <p className="db-sub">Matha School tuition: students, fees and messages in one place.</p>
        </div>
        <div className="db-actions">
          <button className="db-action" onClick={() => navigate('/tuition/fees')}><span>💰</span>Fees</button>
          <button className="db-action" onClick={() => navigate('/tuition/students')}><span>👦</span>Students</button>
          <button className="db-action" onClick={() => navigate('/tuition/messages')}><span>📢</span>Message parents</button>
        </div>
      </div>

      {s && (
        <div className="tu-stats">
          <div className="tu-stat"><strong>{s.students}</strong><span>Tuition students</span></div>
          <div className="tu-stat"><strong>{s.classes}</strong><span>Tuition classes</span></div>
          <div className="tu-stat"><strong>{s.teachers}</strong><span>Teachers</span></div>
          <div className="tu-stat tu-good"><strong>{rupees(s.collected)}</strong><span>Collected in {monthLabel(s.month)}</span></div>
          <div className={`tu-stat ${s.unpaid ? 'tu-warn' : 'tu-good'}`}><strong>{s.unpaid}</strong><span>Not paid yet (of {rupees(s.expected)} due)</span></div>
          <div className="tu-stat"><strong>{rupees(s.salaryPaid)}</strong><span>Salaries paid (of {rupees(s.salaryDue)})</span></div>
          <div className={`tu-stat ${s.collected - s.salaryPaid >= 0 ? 'tu-good' : 'tu-warn'}`}><strong>{rupees(s.collected - s.salaryPaid)}</strong><span>Balance this month</span></div>
        </div>
      )}

      <TodoPanel role="TuitionHead" />
    </div>
  );
}
