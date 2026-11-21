import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import MaxMarksField from '../../components/MaxMarksField';
import { MAIN, partKeys, partsLabel, keyLabel, totalOf, marksForKeys, editableSubject, initialMaxMarks, savedMaxMarks, maxMarksBody } from '../../utils/subjectParts';
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
  const tableRef = useRef(null);

  // Max marks editing
  const [editingMaxMarks, setEditingMaxMarks] = useState(false);
  const [maxMarksInput, setMaxMarksInput] = useState('');
  const [savingMaxMarks, setSavingMaxMarks] = useState(false);
  const [maxMarksError, setMaxMarksError] = useState('');

  const isSplit = !!data?.componentMaxMarks;
  const keys = partKeys(data?.componentMaxMarks); // e.g. ['Main', 'Reading', 'Writing']
  const subjectName = data?.subject?.name || 'Marks';
  // What the teacher may set when editing max marks: main mark + the subject's parts.
  const editSubject = editableSubject({ name: subjectName, components: data?.subject?.components }, data?.componentMaxMarks);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiCall(`/api/subject-teacher/exams/${examId}/subjects/${subjectId}/students`);
      setData(res);
      setMaxMarksInput(res.componentMaxMarks ? { ...res.componentMaxMarks } : String(res.maxMarks));
      const initialInputs = {};
      res.students.forEach(s => {
        initialInputs[s.id] = res.componentMaxMarks
          ? marksForKeys(s.markRecord, partKeys(res.componentMaxMarks))
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

  /** Mark a student absent ("AB") or bring them back (boxes empty again). */
  const toggleAbsent = async (student) => {
    const nowAbsent = !student.markRecord?.isAbsent;
    setSavingStatus(prev => ({ ...prev, [student.id]: 'saving' }));
    try {
      await apiCall('/api/subject-teacher/marks', {
        method: 'POST',
        body: { examId, subjectId, marksData: [nowAbsent ? { studentId: student.id, absent: true } : { studentId: student.id, marksObtained: '' }] },
      });
      setInputValues(prev => ({ ...prev, [student.id]: isSplit ? Object.fromEntries(keys.map(k => [k, ''])) : '' }));
      setData(prev => ({
        ...prev,
        students: prev.students.map(s => (s.id !== student.id ? s : {
          ...s,
          markRecord: { ...s.markRecord, isAbsent: nowAbsent, marksObtained: null, componentMarks: null,
            status: ['SubmittedToClassTeacher', 'Approved', 'Rejected'].includes(s.markRecord?.status) ? 'Pending' : (s.markRecord?.status || 'Pending') },
        })),
      }));
      setSavingStatus(prev => ({ ...prev, [student.id]: 'saved' }));
      setTimeout(() => setSavingStatus(prev => ({ ...prev, [student.id]: null })), 2000);
    } catch (e) {
      setSavingStatus(prev => ({ ...prev, [student.id]: 'error' }));
    }
  };

  /** Enter jumps to the next mark box (like a register). */
  const nextOnEnter = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const boxes = [...(tableRef.current?.querySelectorAll('input.mark-input:not(:disabled)') || [])];
    const next = boxes[boxes.indexOf(e.target) + 1];
    if (next) { next.focus(); next.select(); } else e.target.blur();
  };

  const handleSaveMaxMarks = async () => {
    const { body, error: invalid } = maxMarksBody(editSubject, maxMarksInput);
    if (invalid) { setMaxMarksError(invalid); return; }
    setSavingMaxMarks(true); setMaxMarksError('');
    try {
      await apiCall(`/api/subject-teacher/exam-config/${data.configId}/max-marks`, { method: 'PUT', body });
      setEditingMaxMarks(false);
      await loadData(); // columns change when parts are added or removed
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

  const isDone = (s) => {
    if (s.markRecord?.isAbsent) return true;
    const v = inputValues[s.id];
    return isSplit ? keys.every(k => !isBlank(v?.[k])) : !isBlank(v);
  };
  const missing = data.students.filter(s => !isDone(s));
  const allFilled = missing.length === 0;
  const doneCount = data.students.length - missing.length;
  const savingNow = Object.values(savingStatus).includes('saving');
  const saveError = Object.values(savingStatus).includes('error');

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
                  subject={editSubject}
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
                      setMaxMarksInput(initialMaxMarks(editSubject, savedMaxMarks(data)));
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

      </div>

      {/* Progress, saving and submit: always visible while scrolling */}
      <div className="me-bar">
        <div className="me-progress">
          <div className="me-progress-top">
            <strong>{doneCount} of {data.students.length} entered</strong>
            <span className={`me-save ${saveError ? 'me-save-error' : savingNow ? 'me-save-busy' : ''}`}>
              {saveError ? '⚠ Some marks were not saved: check the red boxes' : savingNow ? 'Saving…' : '✓ All changes saved'}
            </span>
          </div>
          <div className="me-track"><div style={{ width: `${data.students.length ? (doneCount / data.students.length) * 100 : 0}%` }} /></div>
          {!isLocked && !allFilled && (
            <span className="me-missing">
              To submit, enter marks or tap <strong>AB</strong> for: {missing.slice(0, 5).map(s => s.name).join(', ')}{missing.length > 5 ? ` and ${missing.length - 5} more` : ''}
            </span>
          )}
        </div>
        {!isLocked && (
          <button className="btn btn-primary" disabled={submitting || !allFilled || savingNow} onClick={handleSubmitAll}>
            {submitting ? <span className="spinner" /> : `✓ ${submitButtonLabel}`}
          </button>
        )}
        {isLocked && <span className="badge badge-blue">🔒 Finalized: marks can't be changed</span>}
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

      <p className="me-hint">Marks save by themselves. Press <strong>Enter</strong> to go to the next student. Tap <strong>AB</strong> if a student was absent.</p>

      <div className="data-card marks-entry-card" ref={tableRef}>
        <div className="data-table-wrap">
          <table className="data-table me-table">
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
                <th>Absent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map(student => {
                const val = inputValues[student.id];
                const stat = savingStatus[student.id];
                const markRecord = student.markRecord;
                const isRejected = markRecord?.status === 'Rejected';
                const statusText = stat === 'saving' ? 'Saving...' : stat === 'saved' ? 'Saved ✓' : stat === 'error' ? 'Not saved ⚠' : '';
                const absent = !!markRecord?.isAbsent;

                return (
                  <tr key={student.id} className={`${isRejected ? 'row-rejected' : ''}${absent ? ' row-absent' : ''}${!isDone(student) ? ' row-todo' : ''}`}>
                    <td className="me-roll"><code className="roll-number">{student.rollNumber}</code></td>
                    <td className="me-name">
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
                          <td key={k} className="part-col" data-label={`${keyLabel(k, subjectName)} / ${data.componentMaxMarks[k]}`}>
                            <input
                              type="number"
                              inputMode="decimal"
                              className={`form-input mark-input part-input ${outOfRange(val?.[k], data.componentMaxMarks[k]) ? 'input-error' : ''}`}
                              value={absent ? '' : (val?.[k] ?? '')}
                              onChange={e => handleInputChange(student.id, e.target.value, k)}
                              onBlur={() => handleBlur(student.id)}
                              onKeyDown={nextOnEnter}
                              disabled={isLocked || absent}
                              placeholder={absent ? 'AB' : '—'}
                              min="0"
                              max={data.componentMaxMarks[k]}
                              step="0.1"
                              aria-label={`${student.name} ${keyLabel(k, subjectName)}`}
                            />
                          </td>
                        ))}
                        <td className="part-col" data-label={`Total / ${data.maxMarks}`}>
                          <div className="part-total">
                            {absent ? 'AB' : keys.every(k => !isBlank(val?.[k])) ? totalOf(val) : '—'}
                          </div>
                          <span className="save-status-indicator" data-status={stat}>{statusText}</span>
                        </td>
                      </>
                    ) : (
                      <td data-label={`Marks / ${data.maxMarks}`}>
                        <div className="mark-input-wrapper">
                          <input
                            type="number"
                            inputMode="decimal"
                            className={`form-input mark-input ${stat === 'error' ? 'input-error' : ''}`}
                            value={absent ? '' : val}
                            onChange={e => handleInputChange(student.id, e.target.value)}
                            onBlur={() => handleBlur(student.id)}
                            onKeyDown={nextOnEnter}
                            disabled={isLocked || absent}
                            placeholder={absent ? 'AB' : '—'}
                            min="0"
                            max={data.maxMarks}
                            step="0.1"
                          />
                          <span className="save-status-indicator" data-status={stat}>{statusText}</span>
                        </div>
                      </td>
                    )}
                    <td className="me-ab">
                      <button type="button" className={`me-ab-btn${absent ? ' me-ab-on' : ''}`} disabled={isLocked}
                        onClick={() => toggleAbsent(student)} aria-pressed={absent}
                        title={absent ? 'Absent. Tap again to enter marks' : 'Mark this student absent'}>
                        AB
                      </button>
                    </td>
                    <td className="me-status">{statusBadge(markRecord)}</td>
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
