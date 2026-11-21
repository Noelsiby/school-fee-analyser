/**
 * The subject teacher's exams and subjects, each with "Enter marks →". Used on "✍️ Enter marks" (menu).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import '../admin/admin.css';
import '../admin/Exams.css';
import './SubjectTeacher.css';

export default function SubjectMarksList() {
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
    <>
      {loading ? (
        <div className="empty-state"><div className="spinner spinner-dark" /></div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: '#dc2626' }}>⚠ {error}</p>
          <button className="btn btn-ghost" onClick={loadData}>Retry</button>
        </div>
      ) : exams.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
          <p className="empty-state-icon">📚</p>
          <p className="empty-state-text">No exams need your marks right now.</p>
        </div></div>
      ) : (
        <div className="st-exams">
          {exams.map((exam) => (
            // An internal exam appears once per class, so the class is part of the key
            <div key={`${exam.id}-${exam.targetClassId}`} className={`ex-card ex-${exam.status === 'Open' ? 'open' : 'closed'}`}>
              <div className="ex-title">
                <h3>{exam.name}</h3>
                <div className="ex-badges">
                  <span className="badge badge-gray">🏛️ {exam.class?.name}</span>
                  <span className={`badge ${exam.status === 'Open' ? 'badge-green' : 'badge-blue'}`}>
                    {exam.status === 'Open' ? '✍️ Marks entry open' : '✅ Finalized'}
                  </span>
                </div>
              </div>
              <div className="st-subjects">
                {exam.teacherSubjects.map((config) => (
                  <button key={config.subjectId} className="st-subject"
                    onClick={() => navigate(`/subject-teacher/exams/${exam.id}/subjects/${config.subjectId}/marks`)}>
                    <span className="st-subject-name">📚 {config.subject.name}</span>
                    <span className="st-subject-max">out of {config.maxMarks}</span>
                    <span className="st-subject-go">{exam.status === 'Open' ? 'Enter marks →' : 'View →'}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
