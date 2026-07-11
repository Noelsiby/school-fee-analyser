import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import '../admin/admin.css';
import './MarksEntryPage.css'; // Will create this next

export default function MarksEntryPage() {
  const { examId, subjectId } = useParams();
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Local state for input values to handle typing before blur
  const [inputValues, setInputValues] = useState({});
  const [savingStatus, setSavingStatus] = useState({}); // { studentId: 'saving' | 'saved' | 'error' }
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiCall(`/api/subject-teacher/exams/${examId}/subjects/${subjectId}/students`);
      setData(res);
      
      const initialInputs = {};
      res.students.forEach(s => {
        initialInputs[s.id] = s.markRecord?.marksObtained ?? '';
      });
      setInputValues(initialInputs);
    } catch (e) {
      setError(e.message || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, [apiCall, examId, subjectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInputChange = (studentId, value) => {
    setInputValues(prev => ({ ...prev, [studentId]: value }));
  };

  const handleBlur = async (studentId) => {
    const val = inputValues[studentId];
    const student = data.students.find(s => s.id === studentId);
    
    // Check if it actually changed
    const originalVal = student.markRecord?.marksObtained ?? '';
    if (String(val) === String(originalVal)) return;

    // Validate locally first
    if (val !== '') {
      const numVal = Number(val);
      if (isNaN(numVal) || numVal < 0 || numVal > data.maxMarks) {
        setSavingStatus(prev => ({ ...prev, [studentId]: 'error' }));
        return; // Don't save invalid data
      }
    }

    setSavingStatus(prev => ({ ...prev, [studentId]: 'saving' }));
    try {
      await apiCall('/api/subject-teacher/marks', {
        method: 'POST',
        body: {
          examId,
          subjectId,
          marksData: [{ studentId, marksObtained: val }]
        }
      });
      setSavingStatus(prev => ({ ...prev, [studentId]: 'saved' }));
      
      // Clear saved status after 2 seconds
      setTimeout(() => {
        setSavingStatus(prev => ({ ...prev, [studentId]: null }));
      }, 2000);
      
      // Update local data state to reflect the new original value
      setData(prev => {
        const newStudents = prev.students.map(s => {
          if (s.id === studentId) {
            return {
              ...s,
              markRecord: {
                ...s.markRecord,
                marksObtained: val === '' ? null : Number(val),
                status: s.markRecord?.status === 'Rejected' ? 'Pending' : (s.markRecord?.status || 'Pending')
              }
            };
          }
          return s;
        });
        return { ...prev, students: newStudents };
      });
    } catch (e) {
      setSavingStatus(prev => ({ ...prev, [studentId]: 'error' }));
      console.error(e);
    }
  };

  const handleSubmitAll = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      await apiCall('/api/subject-teacher/marks/submit', {
        method: 'PUT',
        body: { examId, subjectId }
      });
      navigate('/subject-teacher/dashboard');
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="admin-page"><div className="empty-state"><div className="spinner spinner-dark" /></div></div>;
  if (error) return <div className="admin-page"><div className="empty-state"><p style={{ color: '#dc2626' }}>⚠ {error}</p><button className="btn btn-primary" onClick={() => navigate('/subject-teacher/dashboard')}>Back</button></div></div>;

  const isLocked = data.exam.isLocked;
  // Subject is submitted/approved overall. But if REJECTED, teacher must be able to re-enter.
  const anySubmitted = data.students.some(s => ['SubmittedToClassTeacher', 'Approved'].includes(s.markRecord?.status));
  const anyRejected = data.students.some(s => s.markRecord?.status === 'Rejected');
  // If rejected, allow editing again (so teacher can fix and resubmit)
  const isReadOnly = isLocked || (anySubmitted && !anyRejected);
  const allFilled = data.students.every(s => inputValues[s.id] !== '' && inputValues[s.id] !== null && inputValues[s.id] !== undefined);

  return (
    <div className="admin-page">
      <div className="detail-breadcrumb">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/subject-teacher/dashboard')}>← Dashboard</button>
        <span style={{ color: '#94a3b8', margin: '0 6px' }}>/</span>
        <span style={{ fontWeight: 600 }}>{data.exam.name}</span>
      </div>

      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Marks Entry</h1>
          <p className="page-sub">
            {data.class.name} · Max Marks: <strong>{data.maxMarks}</strong>
          </p>
        </div>
        {!isReadOnly && (
          <button 
            className="btn btn-primary" 
            disabled={submitting || !allFilled} 
            onClick={handleSubmitAll}
            title={!allFilled ? 'All students must have marks before submitting' : ''}
          >
            {submitting ? <span className="spinner" /> : 'Submit to Class Teacher'}
          </button>
        )}
      </div>

      {isReadOnly && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          ℹ️ Marks have been submitted to the Class Teacher and are currently locked for editing.
        </div>
      )}

      {anyRejected && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          ⚠️ Some marks were rejected by the Class Teacher. Please review the reasons and update them.
        </div>
      )}

      {submitError && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠ {submitError}</div>}

      <div className="data-card" style={{ padding: 24 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '100px' }}>Roll No.</th>
              <th>Student Name</th>
              <th style={{ width: '200px' }}>Marks Obtained</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map(student => {
              const val = inputValues[student.id];
              const stat = savingStatus[student.id];
              const markRecord = student.markRecord;
              const isRejected = markRecord?.status === 'Rejected';
              
              let statusText = stat === 'saving' ? 'Saving...' : stat === 'saved' ? 'Saved ✓' : stat === 'error' ? 'Error ⚠' : '';
              
              return (
                <tr key={student.id} className={isRejected ? 'row-rejected' : ''}>
                  <td><code className="roll-number">{student.rollNumber}</code></td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{student.name}</div>
                    {isRejected && (
                      <div className="rejection-reason">
                        Reason: {markRecord.rejectionReason}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="mark-input-wrapper">
                      <input 
                        type="number"
                        className={`form-input mark-input ${stat === 'error' ? 'input-error' : ''}`}
                        value={val}
                        onChange={e => handleInputChange(student.id, e.target.value)}
                        onBlur={() => handleBlur(student.id)}
                        disabled={isReadOnly}
                        placeholder="—"
                        min="0"
                        max={data.maxMarks}
                        step="0.1"
                      />
                      <span className="save-status-indicator" data-status={stat}>{statusText}</span>
                    </div>
                  </td>
                  <td>
                    {markRecord ? (
                      <span className={`badge badge-${markRecord.status === 'Rejected' ? 'red' : markRecord.status === 'Pending' ? 'gray' : 'green'}`}>
                        {markRecord.status}
                      </span>
                    ) : (
                      <span className="badge badge-gray">Not Entered</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
