import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApi } from '../../hooks/useApi';
import AttendanceToday from '../../components/attendance/AttendanceToday';
import MyDay from '../../components/timetable/MyDay';
import SubjectWatch from '../../components/analysis/SubjectWatch';
import TodoPanel from '../../components/shell/TodoPanel';
import '../../components/analysis/Analysis.css';
import '../admin/admin.css';
import '../admin/Exams.css';
import '../admin/AdminHome.css';
import './ClassTeacher.css';

export default function ClassTeacherDashboard() {
  const { user } = useAuth();
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [, setLoading] = useState(true);
  const [, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await apiCall('/api/class-teacher/exams');
      setExams(data.exams);
    } catch (e) {
      setError(e.message || 'Failed to load exams.');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="admin-page">
      <div className="db-hero ct-hero">
        <div>
          <p className="db-date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</p>
          <h1 className="db-hello">Welcome, {user?.name?.split(' ').slice(0, 2).join(' ') || 'Teacher'} 👋</h1>
          <p className="db-sub">
            {exams.length ? `${exams.filter((e) => e.status === 'Open').length} exam(s) open for your class.` : 'Your class at a glance.'}
          </p>
        </div>
        <div className="db-actions">
          <button className="db-action" onClick={() => navigate('/class-teacher/my-class')}><span>👦</span>My class</button>
          <button className="db-action" onClick={() => navigate('/class-teacher/exams')}><span>📝</span>Exams & marks</button>
          <button className="db-action" onClick={() => navigate('/class-teacher/attendance')}><span>✅</span>Take attendance</button>
        </div>
      </div>

      <TodoPanel role="ClassTeacher" />

      <div className="data-card an-card" style={{ margin: '0 0 16px' }}>
        <AttendanceToday compact onOpen={() => navigate('/class-teacher/attendance')} />
      </div>
      <MyDay attendancePath="/class-teacher/attendance" />
      <SubjectWatch profileBase="/class-teacher/students" />

    </div>
  );
}
