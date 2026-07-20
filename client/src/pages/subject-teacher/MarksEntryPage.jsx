import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import '../admin/admin.css';
import './MarksEntryPage.css';

export default function MarksEntryPage() {
  const { examId, subjectId } = useParams();
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [inputValues, setInputValues] = useState({});
  const [savingStatus, setSavingStatus] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Max marks editing
  const [editingMaxMarks, setEditingMaxMarks] = useState(false);
  const [maxMarksInput, setMaxMarksInput] = useState('');
  const [savingMaxMarks, setSavingMaxMarks] = useState(false);
  const [maxMarksError, setMaxMarksError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiCall(`/api/subject-teacher/exams/${examId}/subjects/${subjectId}/students`);
      setData(res);
      setMaxMarksInput(String(res.maxMarks));
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
    const originalVal = student.markRecord?.marksObtained ?? '';
    if (String(val) === String(originalVal)) return;

    if (val !== '') {
      const numVal = Number(val);
      if (isNaN(numVal) || numVal < 0 || numVal > data.maxMarks) {
        setSavingStatus(prev => ({ ...prev, [studentId]: 'error' }));
        return;
      }
    }

    setSavingStatus(prev => ({ ...prev, [studentId]: 'saving' }));
    try {
      await apiCall('/api/subject-teacher/marks', {
        method: 'POST',
        body: { examId, subjectId, marksData: [{ studentId, marksObtained: val }] }
      });
      setSavingStatus(prev => ({ ...prev, [studentId]: 'saved' }));
      setTimeout(() => {
        setSavingStatus(prev => ({ ...prev, [studentId]: null }));
      }, 2000);

      setData(prev => {
        const newStudents = prev.students.map(s => {
          if (s.id === studentId) {
            const prevStatus = s.markRecord?.status;
            const newStatus = ['SubmittedToClassTeacher', 'Approved'].includes(prevStatus)
              ? 'Pending' : (prevStatus === 'Rejected' ? 'Pending' : (prevStatus || 'Pending'));
            return {
              ...s,
              markRecord: {
                ...s.markRecord,
                marksObtained: val === '' ? null : Number(val),
                status: newStatus
              }
            };
          }
          return s;
        });
        return { ...prev, students: newStudents };
      });
    } catch (e) {
      setSavingStatus(prev => ({ ...prev, [studentId]: 'error' }));
    }
  };

  const handleSaveMaxMarks = async () => {
    const val = Number(maxMarksInput);
    if (isNaN(val) || val <= 0) {
      setMaxMarksError('Please enter a valid positive number.');
      return;
    }
    setSavingMaxMarks(true); setMaxMarksError('');
    try {
      await apiCall(`/api/subject-teacher/exam-config/${data.configId}/max-marks`, {
        method: 'PUT',
        body: { maxMarks: val }
      });
      setData(prev => ({ ...prev, maxMarks: val }));
      setEditingMaxMarks(false);
    } catch (e) {
      setMaxMarksError(e.message);
    } finally {
      setSavingMaxMarks(false);
    }
  };

  const handleSubmitAll = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const isResubmit = anyPreviouslySubmitted;
      const endpoint = isResubmit
        ? '/api/subject-teacher/marks/resubmit'
        : '/api/subject-teacher/marks/submit';

      await apiCall(endpoint, {
        method: 'PUT',
        body: { examId, subjectId }
      });

      await loadData(); // Reload to show updated status
    } catch (e) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="admin-page"><div className="empty-state"><div className="spinner spinner-dark" /></div></div>;
  if (error) return <div className="admin-page"><div className="empty-state"><p style={{ color: '#dc2626' }}>⚠ {error}</p><button className="btn btn-primary" onClick={() => navigate('/subject-teacher/dashboard')}>Back</button></div></div>;

  const isLocked = data.exam.isLocked;

  // Previously submitted = any mark was SubmittedToClassTeacher or Approved at any point
  // We detect from current statuses — if exam is still Open, "submitted" marks that came back as Pending
  // means they were edited after submission. We check original DB status via the current state.
  const anyCurrentlySubmitted = data.students.some(s =>
    ['SubmittedToClassTeacher', 'Approved'].includes(s.markRecord?.status)
  );
  // If any mark exists at all that has been through the system before (not null), consider it "previously submitted"
  // More accurate: check if there are marks at SubmittedToClassTeacher or Approved
  const anyPreviouslySubmitted = anyCurrentlySubmitted;
  const anyRejected = data.students.some(s => s.markRecord?.status === 'Rejected');

  const allFilled = data.students.every(s =>
    inputValues[s.id] !== '' && inputValues[s.id] !== null && inputValues[s.id] !== undefined
  );

  // Show resubmit warning if some marks were already submitted (currently SubmittedToClassTeacher / Approved)
  // AND some have been reset to Pending (meaning the teacher edited them)
  const someResetToPending = data.students.some(s => s.markRecord?.status === 'Pending' && s.markRecord?.marksObtained !== null);
  const showResubmitWarning = anyPreviouslySubmitted && someResetToPending;

  const submitButtonLabel = anyPreviouslySubmitted
    ? 'Update & Resubmit to Class Teacher'
    : 'Submit to Class Teacher';

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span className="page-sub" style={{ margin: 0 }}>{data.class.name}</span>
            <span style={{ color: '#94a3b8' }}>·</span>
            {/* Max Marks inline edit */}
            {editingMaxMarks ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Max Marks:</span>
                <input
                  type="number"
                  value={maxMarksInput}
                  onChange={e => setMaxMarksInput(e.target.value)}
                  style={{
                    width: 80, padding: '4px 8px', border: '2px solid #1E3A8A',
                    borderRadius: 6, fontSize: '0.9rem'
                  }}
                  autoFocus
                  min="1"
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveMaxMarks}
                  disabled={savingMaxMarks}
                >
                  {savingMaxMarks ? <span className="spinner" /> : 'Save'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingMaxMarks(false); setMaxMarksError(''); }}>
                  Cancel
                </button>
                {maxMarksError && <span style={{ color: '#dc2626', fontSize: '0.8rem' }}>{maxMarksError}</span>}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="page-sub" style={{ margin: 0 }}>Maximum Marks: <strong>{data.maxMarks}</strong></span>
                {!isLocked && !data.maxMarksLocked && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                    onClick={() => { setEditingMaxMarks(true); setMaxMarksInput(String(data.maxMarks)); }}
                    title="Edit maximum marks"
                  >
                    ✏️ Edit
                  </button>
                )}
                {data.maxMarksLocked && (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>(locked after submission)</span>
                )}
              </div>
            )}
          </div>
        </div>

        {!isLocked && (
          <button
            className="btn btn-primary"
            disabled={submitting || !allFilled}
            onClick={handleSubmitAll}
            title={!allFilled ? 'All students must have marks before submitting' : ''}
          >
            {submitting ? <span className="spinner" /> : submitButtonLabel}
          </button>
        )}
      </div>

      {/* Resubmit warning banner */}
      {showResubmitWarning && (
        <div className="alert" style={{
          marginBottom: 16,
          backgroundColor: '#fffbeb',
          borderColor: '#fde68a',
          color: '#b45309',
          border: '1px solid #fde68a',
          borderRadius: 8,
          padding: '12px 16px'
        }}>
          ⚠️ You are editing already submitted marks. Clicking <strong>"{submitButtonLabel}"</strong> will notify the Class Teacher to review again.
        </div>
      )}

      {anyCurrentlySubmitted && !someResetToPending && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          ℹ️ Marks have been submitted to the Class Teacher. You can still edit them and resubmit.
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
              <th style={{ width: '200px' }}>Marks (/ {data.maxMarks})</th>
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
                        disabled={isLocked}
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
                      <span className={`badge badge-${
                        markRecord.status === 'Rejected' ? 'red'
                        : markRecord.status === 'Pending' ? 'gray'
                        : markRecord.status === 'Approved' ? 'green'
                        : 'blue'
                      }`}>
                        {markRecord.status === 'SubmittedToClassTeacher' ? 'Submitted' : markRecord.status}
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
