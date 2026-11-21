/**
 * The class teacher's exams: progress of each subject, Review / Finalize, and report-card attendance.
 * Used on "📝 Exams & marks" (menu).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import ReportAttendanceModal from '../../components/report/ReportAttendanceModal';
import '../admin/admin.css';
import '../admin/Exams.css';
import './ClassTeacher.css';

export default function ClassExamsList() {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attFor, setAttFor] = useState(null);   // { examId, cls } for Report card attendance
  const [attNotice, setAttNotice] = useState('');

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
    <>
      {attFor && (
        <ReportAttendanceModal examId={attFor.examId} cls={attFor.cls} onClose={() => setAttFor(null)}
          onSaved={(msg) => { setAttFor(null); setAttNotice(msg); setTimeout(() => setAttNotice(''), 6000); }} />
      )}
      {attNotice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{attNotice}</div>}
      {/* Exams first: reviewing marks is the main job */}
      {loading ? (
        <div className="empty-state"><div className="spinner spinner-dark" /></div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: '#dc2626' }}>⚠ {error}</p>
          <button className="btn btn-ghost" onClick={loadData}>Retry</button>
        </div>
      ) : exams.length === 0 ? (
        <div className="data-card"><div className="empty-state" style={{ padding: 28 }}>
          <p className="empty-state-icon">📝</p>
          <p className="empty-state-text">No exams for your class yet.</p>
        </div></div>
      ) : (
        <div className="ct-exams">
          {exams.map((exam) => {
            const reviews = exam.subjectReviews || [];
            const submitted = reviews.filter((sr) => ['SubmittedToClassTeacher', 'Approved'].includes(sr.status)).length;
            const pct = reviews.length ? Math.round((submitted / reviews.length) * 100) : 0;
            const allIn = reviews.length > 0 && submitted === reviews.length;
            return (
              <div key={`${exam.id}-${exam.targetClassId}`} className={`ex-card ex-${exam.status === 'Closed' ? 'closed' : exam.status === 'Open' ? 'open' : 'draft'}`}>
                <div className="ex-top">
                  <div className="ex-title">
                    <h3>{exam.name}</h3>
                    <div className="ex-badges">
                      <span className={`badge ${exam.status === 'Open' ? 'badge-green' : exam.status === 'Closed' ? 'badge-blue' : 'badge-gray'}`}>
                        {exam.status === 'Open' ? '✍️ Marks entry' : exam.status === 'Closed' ? '✅ Finalized' : exam.status}
                      </span>
                      <span className="badge badge-gray">{exam.class?.name}</span>
                    </div>
                  </div>
                </div>

                {reviews.length > 0 ? (
                  <>
                    <div className="ex-progress">
                      <div className="ex-progress-label">
                        <span>{allIn ? (exam.status === 'Closed' ? 'All done' : 'All subjects in: review and finalize') : 'Waiting for subject teachers'}</span>
                        <strong>{submitted} of {reviews.length} subjects submitted</strong>
                      </div>
                      <div className="ex-bar"><div style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="ex-chips">
                      {reviews.map((sr) => {
                        const ok = ['SubmittedToClassTeacher', 'Approved'].includes(sr.status);
                        const back = sr.status === 'Rejected';
                        return (
                          <span key={sr.subject.id} className={`ex-chip${ok ? ' ex-chip-done' : back ? ' ct-chip-back' : ''}`}
                            title={ok ? 'Submitted' : back ? 'Sent back to the teacher' : 'Not submitted yet'}>
                            {ok ? '✓' : back ? '✕' : '⏳'} {sr.subject.name}
                          </span>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="an-muted" style={{ margin: 0 }}>No subjects set up for this exam yet.</p>
                )}

                <div className="ex-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => navigate(`/class-teacher/exams/${exam.id}/review?classId=${exam.targetClassId}`)}>
                    {allIn && exam.status !== 'Closed' ? '✅ Review & finalize' : '📋 Review marks'}
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => setAttFor({ examId: exam.id, cls: { id: exam.targetClassId, name: exam.class?.name || 'Class' } })}>
                    📅 Report card attendance
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </>
  );
}
