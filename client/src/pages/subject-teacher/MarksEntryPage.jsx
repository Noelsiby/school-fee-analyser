import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import MaxMarksField from '../../components/MaxMarksField';
import { MAIN, partKeys, partsLabel, keyLabel, totalOf } from '../../utils/subjectParts';
import '../admin/admin.css';
import './MarksEntryPage.css';

const isBlank = (v) => v === '' || v === null || v === undefined;

export default function MarksEntryPage() {
  const { examId, subjectId } = useParams();
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // studentId -> '' | number (ordinary subject) or { Main, Reading, ... } (subject with parts)
  const [inputValues, setInputValues] = useState({});
  const [savingStatus, setSavingStatus] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Max marks editing
  const [editingMaxMarks, setEditingMaxMarks] = useState(false);
  const [maxMarksInput, setMaxMarksInput] = useState('');
  const [savingMaxMarks, setSavingMaxMarks] = useState(false);
  const [maxMarksError, setMaxMarksError] = useState('');

  const isSplit = !!data?.componentMaxMarks;
  const keys = partKeys(data?.componentMaxMarks); // e.g. ['Main', 'Reading', 'Writing']
  const subjectName = data?.subject?.name || 'Marks';

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiCall(`/api/subject-teacher/exams/${examId}/subjects/${subjectId}/students`);
      setData(res);
      setMaxMarksInput(res.componentMaxMarks ? { ...res.componentMaxMarks } : String(res.maxMarks));
      const initialInputs = {};
      res.students.forEach(s => {
        initialInputs[s.id] = res.componentMaxMarks
          ? Object.fromEntries(partKeys(res.componentMaxMarks).map(k => [k, s.markRecord?.componentMarks?.[k] ?? '']))
          : s.markRecord?.marksObtained ?? '';
      });
      setInputValues(initialInputs);
    } catch (e) {
      setError(e.message || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, [apiCall, examId, subjectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInputChange = (studentId, value, part) => {
    setInputValues(prev => ({
      ...prev,
      [studentId]: part ? { ...prev[studentId], [part]: value } : value,
    }));
  };

  /** True if `val` is out of range for `max`. Blank is allowed while entering. */
  const outOfRange = (val, max) => !isBlank(val) && (isNaN(Number(val)) || Number(val) < 0 || Number(val) > max);

  const handleBlur = async (studentId) => {
    const val = inputValues[studentId];
    const student = data.students.find(s => s.id === studentId);

    let body, nextRecord;
    if (isSplit) {
      const saved = student.markRecord?.componentMarks || {};
      if (keys.every(k => String(val[k]) === String(saved[k] ?? ''))) return;
      if (keys.some(k => outOfRange(val[k], data.componentMaxMarks[k]))) {
        setSavingStatus(prev => ({ ...prev, [studentId]: 'error' }));
        return;
      }
      const componentMarks = Object.fromEntries(keys.map(k => [k, isBlank(val[k]) ? null : Number(val[k])]));
      const complete = keys.every(k => componentMarks[k] !== null);
      body = { studentId, componentMarks };
      nextRecord = { componentMarks, marksObtained: complete ? totalOf(componentMarks) : null };
    } else {
      const originalVal = student.markRecord?.marksObtained ?? '';
      if (String(val) === String(originalVal)) return;
      if (outOfRange(val, data.maxMarks)) {
        setSavingStatus(prev => ({ ...prev, [studentId]: 'error' }));
        return;
      }
      body = { studentId, marksObtained: val };
      nextRecord = { marksObtained: val === '' ? null : Number(val) };
    }

    setSavingStatus(prev => ({ ...prev, [studentId]: 'saving' }));
    try {
      await apiCall('/api/subject-teacher/marks', {
        method: 'POST',
        body: { examId, subjectId, marksData: [body] }
      });
      setSavingStatus(prev => ({ ...prev, [studentId]: 'saved' }));
      setTimeout(() => {
        setSavingStatus(prev => ({ ...prev, [studentId]: null }));
      }, 2000);

      setData(prev => ({
        ...prev,
        students: prev.students.map(s => {
          if (s.id !== studentId) return s;
          const prevStatus = s.markRecord?.status;
          const newStatus = ['SubmittedToClassTeacher', 'Approved', 'Rejected'].includes(prevStatus)
            ? 'Pending' : (prevStatus || 'Pending');
          return { ...s, markRecord: { ...s.markRecord, ...nextRecord, status: newStatus } };
        }),
      }));
    } catch (e) {
      setSavingStatus(prev => ({ ...prev, [studentId]: 'error' }));
    }
  };

  const handleSaveMaxMarks = async () => {
    let body;
    if (isSplit) {
      if (keys.some(k => !(Number(maxMarksInput[k]) > 0))) {
        setMaxMarksError('Each part needs max marks greater than 0.');
        return;
      }
      body = { componentMaxMarks: Object.fromEntries(keys.map(k => [k, Number(maxMarksInput[k])])) };
    } else {
      const val = Number(maxMarksInput);
      if (isNaN(val) || val <= 0) {
        setMaxMarksError('Please enter a valid positive number.');
        return;
      }
      body = { maxMarks: val };
    }
    setSavingMaxMarks(true); setMaxMarksError('');
    try {
      await apiCall(`/api/subject-teacher/exam-config/${data.configId}/max-marks`, { method: 'PUT', body });
      setData(prev => isSplit
        ? { ...prev, componentMaxMarks: body.componentMaxMarks, maxMarks: totalOf(body.componentMaxMarks) }
        : { ...prev, maxMarks: body.maxMarks });
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

  // Previously submitted = any mark currently SubmittedToClassTeacher or Approved
  const anyCurrentlySubmitted = data.students.some(s =>
    ['SubmittedToClassTeacher', 'Approved'].includes(s.markRecord?.status)
  );
  const anyPreviouslySubmitted = anyCurrentlySubmitted;
  const anyRejected = data.students.some(s => s.markRecord?.status === 'Rejected');

  const allFilled = data.students.every(s => {
    const v = inputValues[s.id];
    return isSplit ? keys.every(k => !isBlank(v?.[k])) : !isBlank(v);
  });

  // Show resubmit warning if some marks were already submitted AND some have been reset to Pending (edited)
  const someResetToPending = data.students.some(s => s.markRecord?.status === 'Pending' && s.markRecord?.marksObtained !== null);
  const showResubmitWarning = anyPreviouslySubmitted && someResetToPending;

  const submitButtonLabel = anyPreviouslySubmitted
    ? 'Update & Resubmit to Class Teacher'
    : 'Submit to Class Teacher';

  const maxMarksText = isSplit
    ? keys.map(k => `${keyLabel(k, subjectName)} ${data.componentMaxMarks[k]}`).join(' + ') + ` = ${data.maxMarks}`
    : data.maxMarks;

  const statusBadge = (markRecord) => markRecord ? (
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
  );

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <span className="page-sub" style={{ margin: 0 }}>{data.class.name}</span>
            {isSplit && <span className="badge badge-purple">{subjectName} {partsLabel(keys.filter(k => k !== MAIN))}</span>}
            <span style={{ color: '#94a3b8' }}>·</span>
            {/* Max Marks inline edit */}
            {editingMaxMarks ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <MaxMarksField
                  subject={{ name: subjectName, components: keys.filter(k => k !== MAIN) }}
                  requireParts
                  value={maxMarksInput}
                  onChange={setMaxMarksInput}
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
                <span className="page-sub" style={{ margin: 0 }}>Maximum Marks: <strong>{maxMarksText}</strong></span>
                {!isLocked && !data.maxMarksLocked && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                    onClick={() => {
                      setEditingMaxMarks(true);
                      setMaxMarksInput(isSplit ? { ...data.componentMaxMarks } : String(data.maxMarks));
                    }}
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
            title={!allFilled ? `All students must have ${isSplit ? 'every part' : 'marks'} entered before submitting` : ''}
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

      <div className="data-card marks-entry-card">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Roll No.</th>
                <th>Student Name</th>
                {isSplit ? (
                  <>
                    {keys.map(k => (
                      <th key={k} className="part-col">{keyLabel(k, subjectName)} <span className="part-max">/ {data.componentMaxMarks[k]}</span></th>
                    ))}
                    <th className="part-col">Total <span className="part-max">/ {data.maxMarks}</span></th>
                  </>
                ) : (
                  <th style={{ width: '200px' }}>Marks (/ {data.maxMarks})</th>
                )}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map(student => {
                const val = inputValues[student.id];
                const stat = savingStatus[student.id];
                const markRecord = student.markRecord;
                const isRejected = markRecord?.status === 'Rejected';
                const statusText = stat === 'saving' ? 'Saving...' : stat === 'saved' ? 'Saved ✓' : stat === 'error' ? 'Error ⚠' : '';

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
                    {isSplit ? (
                      <>
                        {keys.map(k => (
                          <td key={k} className="part-col">
                            <input
                              type="number"
                              className={`form-input mark-input part-input ${outOfRange(val?.[k], data.componentMaxMarks[k]) ? 'input-error' : ''}`}
                              value={val?.[k] ?? ''}
                              onChange={e => handleInputChange(student.id, e.target.value, k)}
                              onBlur={() => handleBlur(student.id)}
                              disabled={isLocked}
                              placeholder="—"
                              min="0"
                              max={data.componentMaxMarks[k]}
                              step="0.1"
                              aria-label={`${student.name} ${keyLabel(k, subjectName)}`}
                            />
                          </td>
                        ))}
                        <td className="part-col">
                          <div className="part-total">
                            {keys.every(k => !isBlank(val?.[k])) ? totalOf(val) : '—'}
                          </div>
                          <span className="save-status-indicator" data-status={stat}>{statusText}</span>
                        </td>
                      </>
                    ) : (
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
                    )}
                    <td>{statusBadge(markRecord)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
