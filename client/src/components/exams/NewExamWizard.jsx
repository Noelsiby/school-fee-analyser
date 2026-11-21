/**
 * Admin → Exams → "+ New exam": one guided window instead of three.
 *   ① Name   ② Classes   ③ Max marks   ④ Check & send to teachers (or keep as a draft)
 * Uses the same API as before: POST /exams → POST /exams/:id/subject-config → PUT /exams/:id/publish.
 */
import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import MaxMarksField from '../MaxMarksField';
import ApplyAllBar from '../ApplyAllBar';
import { ClassPicker, byClassName } from '../SubjectFields';
import { initialMaxMarks, toConfigPayload, hasParts, totalOf } from '../../utils/subjectParts';
import './NewExamWizard.css';

const STEPS = ['Name', 'Classes', 'Max marks', 'Check & send'];

export default function NewExamWizard({ classes, onClose, onDone }) {
  const { apiCall } = useApi();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [classIds, setClassIds] = useState([]);
  const [groups, setGroups] = useState(null);          // [{ classId, className, subjects }]
  const [maxMarks, setMaxMarks] = useState({});        // subjectId → value
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chosen = useMemo(() => [...classes].filter((c) => classIds.includes(c.id)).sort(byClassName), [classes, classIds]);
  const allSubjects = useMemo(() => (groups || []).flatMap((g) => g.subjects), [groups]);

  // Load the chosen classes' subjects when reaching step ③
  useEffect(() => {
    if (step !== 2) return;
    setGroups(null); setError('');
    Promise.all(chosen.map((c) => apiCall(`/api/admin/subjects?classId=${c.id}`).then((r) => ({ classId: c.id, className: c.name, subjects: r.subjects }))))
      .then((g) => {
        setGroups(g);
        setMaxMarks((prev) => {
          const next = { ...prev };
          g.flatMap((x) => x.subjects).forEach((s) => { if (next[s.id] === undefined) next[s.id] = initialMaxMarks(s); });
          return next;
        });
      })
      .catch((e) => setError(e.message));
  }, [step, chosen, apiCall]);

  const noSubjects = groups && groups.filter((g) => g.subjects.length === 0).map((g) => g.className);
  const badMarks = allSubjects.filter((s) => {
    const v = maxMarks[s.id];
    const t = hasParts(s) ? Number(v?.Main) : Number(v);
    return !(t > 0);
  });

  const canNext = step === 0 ? name.trim().length > 0
    : step === 1 ? classIds.length > 0
    : step === 2 ? groups && allSubjects.length > 0 && badMarks.length === 0
    : true;

  const finish = async (send) => {
    setBusy(true); setError('');
    let examId = null;
    try {
      const body = classIds.length === 1
        ? { name: name.trim(), examType: 'CLASS_EXAM', classId: classIds[0], deadline: deadline || null }
        : { name: name.trim(), examType: 'INTERNAL_EXAM', classIds, deadline: deadline || null };
      const { exam } = await apiCall('/api/admin/exams', { method: 'POST', body });
      examId = exam.id;
      await apiCall(`/api/admin/exams/${examId}/subject-config`, { method: 'POST', body: { configs: allSubjects.map((s) => toConfigPayload(s, maxMarks[s.id])) } });
      if (send) await apiCall(`/api/admin/exams/${examId}/publish`, { method: 'PUT' });
      onDone(send ? `✅ "${name.trim()}" sent to teachers. They can start entering marks now.` : `✅ "${name.trim()}" saved as a draft. Send it to teachers from the Exams page when ready.`);
    } catch (e) {
      setError(examId ? `The exam was created, but: ${e.message}. Finish it from its card on the Exams page.` : e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal nw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📝 New exam</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <ol className="nw-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'nw-on' : i < step ? 'nw-done' : ''}>
              <span>{i < step ? '✓' : i + 1}</span>{s}
            </li>
          ))}
        </ol>

        <div className="nw-body">
          {step === 0 && (
            <>
              <label className="form-label">Exam name <span className="required">*</span></label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summative Exam - 2" autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && canNext) setStep(1); }} />
              <label className="form-label" style={{ marginTop: 14 }}>Last date for marks <small>(optional)</small></label>
              <input className="form-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ maxWidth: 220 }} />
            </>
          )}

          {step === 1 && (
            <>
              <p className="nw-help">Which classes write this exam? Tick one class or many.</p>
              <ClassPicker classes={classes} selected={classIds} onChange={setClassIds} />
            </>
          )}

          {step === 2 && (
            !groups ? (error ? <div className="alert alert-error">⚠ {error}</div> : <div className="spinner spinner-dark" />) : (
              <>
                <p className="nw-help">Max marks for each subject. Use the bar to set all subjects at once, then change any that differ.</p>
                {allSubjects.length > 0 && <ApplyAllBar label="Same for every subject" subjects={allSubjects} setValues={setMaxMarks} />}
                {noSubjects?.length > 0 && (
                  <div className="alert alert-info" style={{ margin: '10px 0' }}><div>
                    ⚠ No subjects yet in: <strong>{noSubjects.join(', ')}</strong>. Add them under School setup → Subjects; they will join this exam by themselves.
                  </div></div>
                )}
                <div className="nw-groups">
                  {groups.filter((g) => g.subjects.length).map((g) => (
                    <div key={g.classId} className="nw-group">
                      <p className="nw-group-title">🏛️ {g.className}</p>
                      {g.subjects.map((s) => (
                        <div key={s.id} className="nw-subject">
                          <span>{s.name}</span>
                          <MaxMarksField subject={s} value={maxMarks[s.id]} onChange={(v) => setMaxMarks((m) => ({ ...m, [s.id]: v }))} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )
          )}

          {step === 3 && (
            <div className="nw-review">
              <p><span>Exam</span><strong>{name.trim()}</strong></p>
              {deadline && <p><span>Last date</span><strong>{new Date(deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></p>}
              <p><span>Classes</span><strong>{chosen.map((c) => c.name).join(', ')}</strong></p>
              <p><span>Subjects</span><strong>{allSubjects.length} subject{allSubjects.length === 1 ? '' : 's'}</strong></p>
              <p><span>Max marks</span><strong>{[...new Set(allSubjects.map((s) => (hasParts(s) ? totalOf(maxMarks[s.id]) : Number(maxMarks[s.id]))))].join(', ')}</strong></p>
              <div className="nw-help nw-note">
                <strong>Send to teachers</strong> lets subject teachers start entering marks now. Or keep it as a draft and send it later.
              </div>
            </div>
          )}
          {error && step !== 2 && <div className="alert alert-error" style={{ marginTop: 12 }}>⚠ {error}</div>}
          {step === 2 && groups && badMarks.length > 0 && (
            <p className="nw-warn">Fill in max marks for: {badMarks.slice(0, 6).map((s) => s.name).join(', ')}{badMarks.length > 6 ? '…' : ''}</p>
          )}
        </div>

        <div className="modal-footer nw-footer">
          {step > 0 ? <button className="btn btn-ghost" disabled={busy} onClick={() => setStep(step - 1)}>← Back</button> : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            {step < 3 ? (
              <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next →</button>
            ) : (
              <>
                <button className="btn btn-ghost" disabled={busy} onClick={() => finish(false)}>Save as draft</button>
                <button className="btn btn-primary" disabled={busy} onClick={() => finish(true)}>{busy ? <span className="spinner" /> : '🚀 Send to teachers'}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
