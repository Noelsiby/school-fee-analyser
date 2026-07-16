import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useApi } from '../../hooks/useApi';
import MyStudentsList from './MyStudentsList';
import '../admin/admin.css'; 

export default function ClassTeacherDashboard() {
  const { user } = useAuth();
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      <div className="page-header">
        <div>
          <h1 className="page-title">Class Teacher Dashboard</h1>
          <p className="page-sub">Welcome back, {user?.name}. Manage exams for your class.</p>
        </div>
      </div>

      <MyStudentsList />

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-dark" /></div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: '#dc2626' }}>⚠ {error}</p>
          <button className="btn btn-ghost" onClick={loadData}>Retry</button>
        </div>
      ) : exams.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-icon">🏛️</p>
          <p className="empty-state-text">No exams found for your managed classes.</p>
        </div>
      ) : (
        <div className="classes-grid">
          {exams.map(exam => (
            <div key={exam.id} className="class-card" style={{ borderTop: '4px solid #059669' }}>
              <div className="class-card-header">
                <div className="class-icon">📝</div>
                <span className={`badge ${exam.status === 'Open' ? 'badge-green' : exam.status === 'Closed' ? 'badge-gray' : 'badge-blue'}`}>
                  {exam.status}
                </span>
              </div>

              <h3 className="class-card-name">{exam.name}</h3>
              <p className="class-card-meta">{exam.class?.name}</p>

              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 8 }}>Subject Status:</p>
                {exam.subjectReviews && exam.subjectReviews.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {exam.subjectReviews.map(sr => (
                      <div key={sr.subject.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span style={{ color: '#475569' }}>{sr.subject.name}</span>
                        {['SubmittedToClassTeacher', 'Approved'].includes(sr.status) ? (
                          <span style={{ color: '#059669', fontWeight: 500 }}>Submitted ✅</span>
                        ) : sr.status === 'Rejected' ? (
                          <span style={{ color: '#dc2626', fontWeight: 500 }}>Rejected ❌</span>
                        ) : (
                          <span style={{ color: '#d97706', fontWeight: 500 }}>Pending ⏳</span>
                        )}
                      </div>
                    ))}
                    {(() => {
                      const total = exam.subjectReviews.length;
                      const submitted = exam.subjectReviews.filter(sr => ['SubmittedToClassTeacher', 'Approved'].includes(sr.status)).length;
                      const pct = Math.round((submitted / total) * 100);
                      return (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }}>
                            <span>Progress</span>
                            <span>{submitted} of {total} subjects submitted</span>
                          </div>
                          <div style={{ background: '#e2e8f0', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ background: '#059669', height: '100%', width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No subjects configured.</p>
                )}
              </div>

              <div style={{ marginTop: '16px' }}>
                <button 
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => navigate(`/class-teacher/exams/${exam.id}/review?classId=${exam.targetClassId}`)}
                >
                  Review Marks →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
