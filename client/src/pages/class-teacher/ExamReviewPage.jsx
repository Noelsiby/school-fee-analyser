import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import FullMarksheetReview from './FullMarksheetReview';
import '../admin/admin.css';

export default function ExamReviewPage() {
  const { id } = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const classId = searchParams.get('classId');

  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [actioning, setActioning] = useState(false);
  const [rejectModal, setRejectModal] = useState(null); // stores the subject config obj
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  
  const [showMarksheet, setShowMarksheet] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiCall(`/api/class-teacher/exams/${id}/review?classId=${classId}`);
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load review data.');
    } finally {
      setLoading(false);
    }
  }, [apiCall, id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleApprove = async (subjectId) => {
    setActioning(true);
    try {
      await apiCall('/api/class-teacher/marks/approve', {
        method: 'PUT',
        body: { examId: id, subjectId }
      });
      loadData();
    } catch (e) {
      alert(e.message);
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setRejectError('Please provide a reason for rejection.');
      return;
    }
    setActioning(true); setRejectError('');
    try {
      await apiCall('/api/class-teacher/marks/reject', {
        method: 'PUT',
        body: { examId: id, subjectId: rejectModal.subject.id, reason: rejectReason }
      });
      setRejectModal(null);
      setRejectReason('');
      loadData();
    } catch (e) {
      setRejectError(e.message);
    } finally {
      setActioning(false);
    }
  };

  const handleFinalize = async () => {
    if (!window.confirm("Are you sure you want to finalize this exam? This action cannot be undone and will transfer the exam to Admin.")) return;
    
    setActioning(true);
    try {
      await apiCall(`/api/class-teacher/exams/${id}/finalize?classId=${classId}`, { method: 'PUT' });
      navigate('/class-teacher/dashboard');
    } catch (e) {
      alert(e.message);
      setActioning(false);
    }
  };

  if (loading) return <div className="admin-page"><div className="empty-state"><div className="spinner spinner-dark" /></div></div>;
  if (error) return <div className="admin-page"><div className="empty-state"><p style={{ color: '#dc2626' }}>⚠ {error}</p><button className="btn btn-primary" onClick={() => navigate('/class-teacher/dashboard')}>Back</button></div></div>;

  const isLocked = data.exam.isLocked;
  const allApproved = data.subjectReviews.every(s => s.status === 'Approved');

  const getStatusBadge = (status) => {
    switch(status) {
      case 'Pending': return <span className="badge badge-gray">Pending</span>;
      case 'SubmittedToClassTeacher': return <span className="badge badge-blue">Submitted</span>;
      case 'Approved': return <span className="badge badge-green">Approved</span>;
      case 'Rejected': return <span className="badge badge-red">Rejected</span>;
      default: return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div className="admin-page">
      <div className="detail-breadcrumb">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/class-teacher/dashboard')}>← Dashboard</button>
        <span style={{ color: '#94a3b8', margin: '0 6px' }}>/</span>
        <span style={{ fontWeight: 600 }}>{data.exam.name} Review</span>
      </div>

      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">{data.exam.name}</h1>
          <p className="page-sub">{data.class.name} · Master Review</p>
        </div>
        {!isLocked && (
          <button 
            className="btn btn-primary" 
            disabled={!allApproved || actioning} 
            onClick={handleFinalize}
            title={!allApproved ? "All subjects must be approved before finalizing" : "Finalize and lock exam"}
          >
            {actioning ? <span className="spinner" /> : 'Finalize Exam'}
          </button>
        )}
      </div>

      {isLocked && (
        <div className="alert alert-info" style={{ marginBottom: 24 }}>
          ℹ️ This exam has been finalized and locked. Admin will handle report card generation.
        </div>
      )}

      {data.subjectReviews.every(s => ['SubmittedToClassTeacher', 'Approved'].includes(s.status)) && (
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowMarksheet(!showMarksheet)}
            style={{ background: '#f8fafc', color: '#0f172a', borderColor: '#cbd5e1' }}
          >
            {showMarksheet ? 'Hide Full Marksheet' : 'Review Full Marksheet 📊'}
          </button>
        </div>
      )}

      {showMarksheet && (
        <FullMarksheetReview 
          examId={id} 
          classId={classId} 
          isLocked={isLocked} 
        />
      )}

      <div className="data-card" style={{ marginTop: 24 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Assigned Teacher</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.subjectReviews.map(review => {
              const { subject, subjectTeacher, status, stats } = review;
              const isSubmitted = status === 'SubmittedToClassTeacher';
              const progressPercentage = Math.round((stats.enteredMarks / stats.totalStudents) * 100) || 0;

              return (
                <tr key={subject.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{subject.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Max Marks: {review.maxMarks}</div>
                  </td>
                  <td>{subjectTeacher ? subjectTeacher.name : <span style={{ color: '#94a3b8' }}>Unassigned</span>}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${progressPercentage}%`, background: '#059669', height: '100%' }} />
                      </div>
                      <span style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {stats.enteredMarks} / {stats.totalStudents}
                      </span>
                    </div>
                  </td>
                  <td>{getStatusBadge(status)}</td>
                  <td>
                    <div className="table-actions">
                      {!isLocked && isSubmitted && (
                        <>
                          <button 
                            className="btn btn-primary btn-sm" 
                            style={{ background: '#059669', borderColor: '#059669' }}
                            onClick={() => handleApprove(subject.id)}
                            disabled={actioning}
                          >
                            ✓ Approve
                          </button>
                          <button 
                            className="btn btn-ghost btn-sm" 
                            style={{ color: '#dc2626' }}
                            onClick={() => { setRejectModal(review); setRejectReason(''); setRejectError(''); }}
                            disabled={actioning}
                          >
                            ✕ Reject
                          </button>
                        </>
                      )}
                      {!isLocked && status === 'Approved' && (
                        <button 
                            className="btn btn-ghost btn-sm" 
                            style={{ color: '#dc2626' }}
                            onClick={() => { setRejectModal(review); setRejectReason(''); setRejectError(''); }}
                            disabled={actioning}
                          >
                            ✕ Revoke Approval
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title">Reject Marks for {rejectModal.subject.name}</h2>
              <button className="modal-close" onClick={() => setRejectModal(null)}>✕</button>
            </div>
            <form onSubmit={handleReject}>
              {rejectError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {rejectError}</div>}
              
              <div className="form-group">
                <label className="form-label">Reason for Rejection <span className="required">*</span></label>
                <textarea 
                  className="form-input" 
                  rows="3"
                  value={rejectReason}
                  placeholder="e.g., Please double check marks for John Doe, they seem abnormally low."
                  onChange={e => setRejectReason(e.target.value)}
                  autoFocus
                />
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                  This will be sent to the Subject Teacher ({rejectModal.subjectTeacher?.name || 'Unassigned'}).
                </p>
              </div>

              <div className="modal-footer" style={{ marginTop: 24 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setRejectModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} disabled={actioning}>
                  {actioning ? <span className="spinner" /> : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
