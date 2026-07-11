import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApi } from '../../hooks/useApi';
import '../admin/admin.css'; // Use shared admin styles

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Subject Teacher Dashboard</h1>
          <p className="page-sub">Welcome back, {user?.name}. Here are your assigned exams.</p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-dark" /></div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: '#dc2626' }}>⚠ {error}</p>
          <button className="btn btn-ghost" onClick={loadData}>Retry</button>
        </div>
      ) : exams.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-icon">📚</p>
          <p className="empty-state-text">No open exams require your attention right now.</p>
        </div>
      ) : (
        <div className="classes-grid">
          {exams.map(exam => (
            <div key={exam.id} className="class-card" style={{ borderTop: '4px solid #4338ca' }}>
              <div className="class-card-header">
                <div className="class-icon">📝</div>
                <span className={`badge ${exam.status === 'Open' ? 'badge-green' : 'badge-gray'}`}>
                  {exam.status}
                </span>
              </div>

              <h3 className="class-card-name">{exam.name}</h3>
              <p className="class-card-meta">{exam.class?.name}</p>

              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Assigned Subjects
                </p>
                {exam.teacherSubjects.map(config => (
                  <button 
                    key={config.subjectId}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'space-between', border: '1px solid #e2e8f0' }}
                    onClick={() => navigate(`/subject-teacher/exams/${exam.id}/subjects/${config.subjectId}/marks`)}
                  >
                    <span>📚 {config.subject.name}</span>
                    <span style={{ fontSize: '0.8rem', color: '#1e3a8a', fontWeight: 600 }}>Enter Marks →</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
