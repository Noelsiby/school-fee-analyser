import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApi } from '../../hooks/useApi';
import '../admin/admin.css'; // Use shared admin styles
import '../admin/Exams.css';
import '../admin/AdminHome.css';
import './SubjectTeacher.css';
import MyDay from '../../components/timetable/MyDay';
import TodoPanel from '../../components/shell/TodoPanel';

export default function SubjectTeacherDashboard() {
  const { user } = useAuth();
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await apiCall('/api/subject-teacher/exams');
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
      <div className="db-hero st-hero">
        <div>
          <p className="db-date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</p>
          <h1 className="db-hello">Welcome, {user?.name?.split(' ').slice(0, 2).join(' ') || 'Teacher'} 👋</h1>
          <p className="db-sub">
            {exams.length
              ? `You have ${exams.reduce((n, e) => n + e.teacherSubjects.length, 0)} subject(s) for marks. Open ✍️ Enter marks to start.`
              : 'Your exams appear here when the office sends them.'}
          </p>
        </div>
      </div>

      <TodoPanel role="SubjectTeacher" />
      <MyDay attendancePath="/subject-teacher/attendance" />
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={() => navigate('/subject-teacher/marks')}>✍️ All my subjects: enter marks →</button>
      </div>

    </div>
  );
}
