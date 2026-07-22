import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import Modal from '../../components/Modal';
import './admin.css';

const EMPTY_FORM = { name: '', examType: 'CLASS_EXAM', classId: '', classIds: [], deadline: '' };

export default function ExamsPage() {
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState(null); // 'create' | 'config' | 'publish'
  const [deleteModal, setDeleteModal] = useState(null);
  const [publishPublicModal, setPublishPublicModal] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // State for config modal
  const [classSubjects, setClassSubjects] = useState([]);
  const [groupedSubjects, setGroupedSubjects] = useState([]); // Array of { classId, className, studentCount, subjects }
  const [expandedSections, setExpandedSections] = useState({}); // { [classId]: boolean }
  const [copyToAllValue, setCopyToAllValue] = useState('');
  const [maxMarksValues, setMaxMarksValues] = useState({});
  const [configSuccess, setConfigSuccess] = useState([]);

  // State for enhanced Edit modal
  const [editAccordion, setEditAccordion] = useState({ basic: true, classes: true, maxmarks: false });
  const [editEnrollments, setEditEnrollments] = useState([]); // local copy of enrollments
  const [editSubjects, setEditSubjects] = useState({}); // { classId: [subjects] }
  const [editMaxMarks, setEditMaxMarks] = useState({}); // { subjectId: maxMarks }
  const [addClassId, setAddClassId] = useState('');
  const [editActionError, setEditActionError] = useState('');
  const [editActionLoading, setEditActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [examsData, classesData] = await Promise.all([
        apiCall('/api/admin/exams'),
        apiCall('/api/admin/classes')
      ]);
      setExams(examsData.exams);
      setClasses(classesData.classes);
    } catch (e) {
      setError(e.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => { setForm(EMPTY_FORM); setFormError(''); setModal('create'); };
  
  const openConfig = async (exam) => {
    setSelectedExam(exam);
    setFormError('');
    setModal('config');
    setSaving(true);
    try {
      let subjects = [];
      let grouped = [];
      const initExpanded = {};

      if (exam.examType === 'INTERNAL_EXAM' && exam.enrollments?.length > 0) {
        const promises = exam.enrollments.map(async (e) => {
          const res = await apiCall(`/api/admin/subjects?classId=${e.classId}`);
          const classSubjects = res.subjects.map(s => ({ ...s, className: e.class.name }));
          
          grouped.push({
            classId: e.classId,
            className: e.class.name,
            studentCount: e.class?._count?.students || 0,
            subjects: classSubjects
          });
          initExpanded[e.classId] = true;
          return classSubjects;
        });
        const results = await Promise.all(promises);
        subjects = results.flat();
      } else {
        const res = await apiCall(`/api/admin/subjects?classId=${exam.classId}`);
        subjects = res.subjects.map(s => ({ ...s, className: exam.class?.name }));
        
        grouped.push({
          classId: exam.classId,
          className: exam.class?.name,
          studentCount: exam.class?._count?.students || 0,
          subjects: subjects
        });
        initExpanded[exam.classId] = true;
      }
      
      setClassSubjects(subjects);
      setGroupedSubjects(grouped);
      setExpandedSections(initExpanded);
      setCopyToAllValue('');
      
      const initialValues = {};
      exam.subjectConfigs.forEach(c => {
        initialValues[c.subjectId] = c.maxMarks;
      });
      subjects.forEach(s => {
        if (!initialValues[s.id]) initialValues[s.id] = 100; // default 100
      });
      setMaxMarksValues(initialValues);
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openPublish = (exam) => {
    setSelectedExam(exam);
    setFormError('');
    setModal('publish');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.classIds.length === 0) { setFormError('Name and at least one class are required.'); return; }
    setSaving(true); setFormError('');
    try {
      await apiCall('/api/admin/exams', { method: 'POST', body: form });
      setModal(null);
      loadData();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfigSave = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const configs = classSubjects.map(s => ({
        subjectId: s.id,
        maxMarks: Number(maxMarksValues[s.id])
      }));
      await apiCall(`/api/admin/exams/${selectedExam.id}/subject-config`, { 
        method: 'POST', 
        body: { configs } 
      });

      // Generate success messages per class for INTERNAL_EXAM
      if (selectedExam.examType === 'INTERNAL_EXAM') {
        const messages = groupedSubjects.map(g => 
          `✅ ${g.className} configured (${g.subjects.length} subjects)`
        );
        setConfigSuccess(messages);
        setTimeout(() => setConfigSuccess([]), 5000);
      }

      setModal(null);
      loadData();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true); setFormError('');
    try {
      await apiCall(`/api/admin/exams/${selectedExam.id}/publish`, { method: 'PUT' });
      setModal(null);
      loadData();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePublishPublic = async () => {
    if (!publishPublicModal) return;
    setSaving(true);
    try {
      await apiCall(`/api/admin/exams/${publishPublicModal.id}/publish-results`, { method: 'PUT' });
      setConfigSuccess([
        '✅ Results published! Parents can now view results at /results',
        `Share this link with parents: ${window.location.origin}/results`
      ]);
      setPublishPublicModal(null);
      setTimeout(() => setConfigSuccess([]), 10000);
      loadData();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublishPublic = async (examId) => {
    setLoading(true);
    try {
      await apiCall(`/api/admin/exams/${examId}/unpublish-results`, { method: 'PUT' });
      setConfigSuccess(['Results hidden from public view']);
      setTimeout(() => setConfigSuccess([]), 5000);
      loadData();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };



  const openRename = async (exam) => {
    setSelectedExam(exam);
    setForm({ name: exam.name, deadline: exam.deadline ? exam.deadline.split('T')[0] : '' });
    setFormError('');
    setEditActionError('');
    setAddClassId('');
    setEditAccordion({ basic: true, classes: exam.examType === 'INTERNAL_EXAM', maxmarks: false });

    // Populate enrollments from exam data
    const enrollments = exam.enrollments || [];
    setEditEnrollments(enrollments);

    // Load subjects per enrolled class for max marks
    const subjects = {};
    const maxMarks = {};
    exam.subjectConfigs.forEach(c => {
      maxMarks[c.subjectId] = c.maxMarks;
    });
    setEditMaxMarks(maxMarks);

    if (exam.examType === 'INTERNAL_EXAM' && enrollments.length > 0) {
      try {
        const promises = enrollments.map(async (e) => {
          const res = await apiCall(`/api/admin/subjects?classId=${e.classId}`);
          subjects[e.classId] = res.subjects;
          // Set default 100 for unconfigured subjects
          res.subjects.forEach(s => {
            if (!maxMarks[s.id]) maxMarks[s.id] = 100;
          });
        });
        await Promise.all(promises);
      } catch (err) {
        // non-fatal
      }
    } else if (exam.examType === 'CLASS_EXAM' && exam.classId) {
      try {
        const res = await apiCall(`/api/admin/subjects?classId=${exam.classId}`);
        subjects[exam.classId] = res.subjects;
        res.subjects.forEach(s => {
          if (!maxMarks[s.id]) maxMarks[s.id] = 100;
        });
      } catch (err) {
        // non-fatal
      }
    }
    setEditSubjects(subjects);
    setEditMaxMarks({ ...maxMarks });
    setModal('rename');
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true); setFormError('');
    try {
      await apiCall(`/api/admin/exams/${selectedExam.id}`, { method: 'PUT', body: { name: form.name, deadline: form.deadline } });
      setModal(null);
      loadData();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMaxMarks = async () => {
    if (!selectedExam) return;
    setEditActionLoading(true); setEditActionError('');
    try {
      const allSubjectIds = Object.keys(editMaxMarks);
      if (allSubjectIds.length === 0) {
        setEditActionError('No subjects to configure.');
        return;
      }
      const configs = allSubjectIds.map(subjectId => ({
        subjectId: Number(subjectId),
        maxMarks: Number(editMaxMarks[subjectId]) || 100
      }));
      await apiCall(`/api/admin/exams/${selectedExam.id}/max-marks`, { method: 'PUT', body: { configs } });
      setConfigSuccess(['✅ Max marks updated successfully!']);
      setTimeout(() => setConfigSuccess([]), 4000);
      loadData();
    } catch (err) {
      setEditActionError(err.message);
    } finally {
      setEditActionLoading(false);
    }
  };

  const handleAddClass = async () => {
    if (!addClassId || !selectedExam) return;
    setEditActionLoading(true); setEditActionError('');
    try {
      const res = await apiCall(`/api/admin/exams/${selectedExam.id}/classes`, { method: 'POST', body: { classId: Number(addClassId) } });
      // Update local state
      const newEnrollment = res.enrollment;
      setEditEnrollments(prev => [...prev, newEnrollment]);
      // Load subjects for new class
      const subjRes = await apiCall(`/api/admin/subjects?classId=${addClassId}`);
      setEditSubjects(prev => ({ ...prev, [addClassId]: subjRes.subjects }));
      subjRes.subjects.forEach(s => {
        setEditMaxMarks(prev => ({ ...prev, [s.id]: prev[s.id] || 100 }));
      });
      setAddClassId('');
      loadData();
    } catch (err) {
      setEditActionError(err.message);
    } finally {
      setEditActionLoading(false);
    }
  };

  const handleRemoveClass = async (classId, className) => {
    if (!selectedExam) return;
    if (!window.confirm(`Remove ${className} from this exam?`)) return;
    setEditActionLoading(true); setEditActionError('');
    try {
      await apiCall(`/api/admin/exams/${selectedExam.id}/classes/${classId}`, { method: 'DELETE' });
      setEditEnrollments(prev => prev.filter(e => e.classId !== classId));
      loadData();
    } catch (err) {
      setEditActionError(err.message);
    } finally {
      setEditActionLoading(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteModal) return;
    setSaving(true);
    try {
      await apiCall(`/api/admin/exams/${deleteModal.id}`, { method: 'DELETE' });
      setConfigSuccess([`Exam '${deleteModal.name}' has been permanently deleted`]);
      setDeleteModal(null);
      setTimeout(() => setConfigSuccess([]), 5000);
      loadData();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status) => {
    switch(status) {
      case 'Draft': return <span className="badge badge-gray">Draft</span>;
      case 'Open': return <span className="badge badge-green">Open</span>;
      case 'Completed': return <span className="badge badge-blue">Completed</span>;
      default: return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Exams</h1>
          <p className="page-sub">Manage exams, configure max marks, and publish them for grading.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Create Exam</button>
      </div>

      {configSuccess.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {configSuccess.map((msg, i) => (
            <div key={i} className="alert alert-success" style={{ marginBottom: 8 }}>{msg}</div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-dark" /></div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: '#dc2626' }}>⚠ {error}</p>
          <button className="btn btn-ghost" onClick={loadData}>Retry</button>
        </div>
      ) : exams.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-icon">📝</p>
          <p className="empty-state-text">No exams yet. Create your first exam!</p>
          <button className="btn btn-primary" onClick={openCreate}>Create Exam</button>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Exam Name</th>
                <th>Type</th>
                <th>Class / Classes</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Configured</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map(exam => {
                const isConfigured = exam.subjectConfigs.length > 0;
                const isInternal = exam.examType === 'INTERNAL_EXAM';
                const canPublish = !exam.isPublished && (exam.status === 'Closed' || exam.status === 'Open');
                return (
                  <tr key={exam.id}>
                    <td>
                      <strong>{exam.name}</strong>
                      {exam.isPublished && (
                        <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#dcfce7', color: '#16a34a' }}>
                          🌐 Published
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ 
                        padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                        backgroundColor: isInternal ? '#fef08a' : '#bfdbfe',
                        color: isInternal ? '#854d0e' : '#1e40af'
                      }}>
                        {isInternal ? 'Internal Exam' : 'Class Exam'}
                      </span>
                    </td>
                    <td>
                      {isInternal 
                        ? exam.enrollments?.map(e => e.class.name).join(', ') 
                        : exam.class?.name}
                    </td>
                    <td>{exam.deadline ? new Date(exam.deadline).toLocaleDateString() : '—'}</td>
                    <td>
                      {isInternal && exam.status === 'Open' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                            {statusBadge(exam.status)} ({(exam.enrollments?.filter(e => e.status === 'Finalized')?.length || 0)} of {exam.enrollments?.length || 0} finalized)
                          </div>
                          {exam.enrollments?.map(e => (
                            <div key={e.class.id} style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>{e.class.name}:</span>
                              {e.status === 'Finalized' ? (
                                <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅ Finalized</span>
                              ) : (
                                <span style={{ color: '#d97706', fontWeight: 'bold' }}>⏳ {e.status}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        statusBadge(exam.status)
                      )}
                    </td>
                    <td>
                      {isConfigured ? (
                        <span style={{ color: '#16a34a', fontSize: '0.85rem', fontWeight: 500 }}>
                          ✓ {exam.subjectConfigs.length} subjects
                          {isInternal && exam.enrollments && ` across ${exam.enrollments.length} classes`}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Not configured</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        {exam.status === 'Draft' && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => openRename(exam)}>✏️ Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openConfig(exam)}>⚙️ Configure</button>
                            <button 
                              className="btn btn-primary btn-sm" 
                              onClick={() => openPublish(exam)}
                              disabled={!isConfigured}
                              title={!isConfigured ? "Configure max marks first" : "Publish to teachers"}
                            >
                              🚀 Publish
                            </button>
                          </>
                        )}
                        {exam.status !== 'Draft' && (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => openRename(exam)}>✏️ Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/admin/exams/${exam.id}/results`)}>
                              📊 View Results
                            </button>
                          </>
                        )}
                        {canPublish && (
                          <button 
                            className="btn btn-primary btn-sm" 
                            style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', color: 'white' }}
                            onClick={() => setPublishPublicModal(exam)}
                          >
                            🌐 Publish Results
                          </button>
                        )}
                        {exam.isPublished && (
                          <button className="btn btn-ghost btn-sm" style={{ color: '#b45309' }} onClick={() => handleUnpublishPublic(exam.id)}>
                            🚫 Unpublish
                          </button>
                        )}
                        <button 
                          className="btn btn-ghost btn-sm" 
                          style={{ color: '#dc2626', cursor: 'pointer' }} 
                          onClick={() => setDeleteModal(exam)}
                          title="Delete Exam"
                        >
                          🗑️ Delete
                        </button>
                      </div>

                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Exam Modal — Full Accordion */}
      {modal === 'rename' && selectedExam && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, borderBottom: '1px solid #e2e8f0' }}>
              <h2 className="modal-title">✏️ Edit Exam — {selectedExam.name}</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>

            {editActionError && <div className="alert alert-error" style={{ margin: '12px 16px 0' }}>⚠ {editActionError}</div>}
            {formError && <div className="alert alert-error" style={{ margin: '12px 16px 0' }}>⚠ {formError}</div>}

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* ── SECTION 1: Basic Info ── */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setEditAccordion(a => ({ ...a, basic: !a.basic }))}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}
                >
                  <span>📋 Basic Info</span>
                  <span>{editAccordion.basic ? '▲' : '▼'}</span>
                </button>
                {editAccordion.basic && (
                  <form onSubmit={handleRename} style={{ padding: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Exam Name <span className="required">*</span></label>
                      <input
                        className="form-input"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Deadline (Optional)</label>
                      <input
                        type="date"
                        className="form-input"
                        value={form.deadline}
                        onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                        {saving ? <span className="spinner" /> : '💾 Save Name & Deadline'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* ── SECTION 2: Enrolled Classes (Internal Exams only) ── */}
              {selectedExam.examType === 'INTERNAL_EXAM' && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setEditAccordion(a => ({ ...a, classes: !a.classes }))}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}
                  >
                    <span>🏫 Enrolled Classes ({editEnrollments.length})</span>
                    <span>{editAccordion.classes ? '▲' : '▼'}</span>
                  </button>
                  {editAccordion.classes && (
                    <div style={{ padding: '16px' }}>

                      {/* Enrolled list */}
                      <div style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Currently Enrolled</p>
                        {editEnrollments.length === 0 ? (
                          <p style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>No classes enrolled.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {editEnrollments.map(e => {
                              const cls = e.class;
                              const studentCount = cls?._count?.students ?? (cls?.students?.length ?? '?');
                              return (
                                <div key={e.classId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                                  <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                    ✅ {cls?.name || `Class #${e.classId}`}
                                    <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8, fontSize: '0.82rem' }}>({studentCount} students)</span>
                                    {e.status === 'Finalized' && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>• Finalized</span>}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: '#dc2626', borderColor: '#fecaca', fontSize: '0.78rem', padding: '2px 8px' }}
                                    onClick={() => handleRemoveClass(e.classId, cls?.name)}
                                    disabled={editActionLoading}
                                  >
                                    ✕ Remove
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Add class */}
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add a New Class</p>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select
                            className="form-input"
                            style={{ flex: 1 }}
                            value={addClassId}
                            onChange={e => setAddClassId(e.target.value)}
                          >
                            <option value="">— Select class to add —</option>
                            {classes
                              .filter(c => !editEnrollments.some(e => e.classId === c.id))
                              .map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c._count?.students ?? 0} students)</option>
                              ))
                            }
                          </select>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={handleAddClass}
                            disabled={!addClassId || editActionLoading}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            {editActionLoading ? <span className="spinner" /> : '+ Add'}
                          </button>
                        </div>
                        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 6 }}>
                          Teachers for the new class will be notified automatically.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── SECTION 3: Max Marks per Subject ── */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setEditAccordion(a => ({ ...a, maxmarks: !a.maxmarks }))}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}
                >
                  <span>📊 Max Marks per Subject</span>
                  <span>{editAccordion.maxmarks ? '▲' : '▼'}</span>
                </button>
                {editAccordion.maxmarks && (
                  <div style={{ padding: '16px' }}>
                    {selectedExam.status !== 'Draft' && (
                      <div className="alert alert-warning" style={{ marginBottom: 12, fontSize: '0.82rem' }}>
                        ⚠️ Changing max marks after teachers have entered marks will affect percentage calculations.
                      </div>
                    )}
                    {Object.keys(editSubjects).length === 0 ? (
                      <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No subjects loaded. Try closing and reopening this modal.</p>
                    ) : (
                      Object.entries(editSubjects).map(([classId, subjects]) => {
                        const classEnroll = editEnrollments.find(e => e.classId === Number(classId));
                        const cls = classEnroll?.class;
                        const singleClass = selectedExam.examType === 'CLASS_EXAM';
                        return (
                          <div key={classId} style={{ marginBottom: 16 }}>
                            {!singleClass && (
                              <p style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a', marginBottom: 8 }}>
                                🏫 {cls?.name || `Class #${classId}`}
                              </p>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {subjects.map(sub => (
                                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                  <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{sub.name}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Max:</span>
                                    <input
                                      type="number"
                                      min="1"
                                      max="1000"
                                      value={editMaxMarks[sub.id] ?? 100}
                                      onChange={e => setEditMaxMarks(prev => ({ ...prev, [sub.id]: e.target.value }))}
                                      style={{ width: 64, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.88rem', textAlign: 'center' }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleSaveMaxMarks}
                        disabled={editActionLoading}
                        style={{ background: '#0f766e', borderColor: '#0f766e' }}
                      >
                        {editActionLoading ? <span className="spinner" /> : '💾 Save Max Marks'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>{/* end sections */}

            <div className="modal-footer" style={{ position: 'sticky', bottom: 0, background: 'white', borderTop: '1px solid #e2e8f0', padding: '12px 20px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create New Exam</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
              
              <div className="form-group">
                <label className="form-label">Exam Type</label>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input 
                      type="radio" 
                      name="examType" 
                      checked={form.examType === 'CLASS_EXAM'} 
                      onChange={() => setForm(f => ({ ...f, examType: 'CLASS_EXAM', classIds: [] }))} 
                    />
                    Class Exam (Single Class)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input 
                      type="radio" 
                      name="examType" 
                      checked={form.examType === 'INTERNAL_EXAM'} 
                      onChange={() => setForm(f => ({ ...f, examType: 'INTERNAL_EXAM', classId: '' }))} 
                    />
                    Internal Exam (Multi-Class)
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Exam Name <span className="required">*</span></label>
                <input 
                  className="form-input" 
                  value={form.name} 
                  placeholder="e.g. First Internal, Mid Term"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                  autoFocus 
                />
              </div>

              {form.examType === 'CLASS_EXAM' ? (
                <div className="form-group">
                  <label className="form-label">Select Class <span className="required">*</span></label>
                  <select 
                    className="form-select" 
                    value={form.classId} 
                    onChange={e => setForm(f => ({ ...f, classId: e.target.value }))}
                  >
                    <option value="">— Select Class —</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Select Classes <span className="required">*</span></label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--gray-200)', padding: '8px', borderRadius: '8px' }}>
                    {classes.map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                        <input 
                          type="checkbox" 
                          checked={form.classIds.includes(c.id)}
                          onChange={e => {
                            const checked = e.target.checked;
                            setForm(f => ({
                              ...f, 
                              classIds: checked ? [...f.classIds, c.id] : f.classIds.filter(id => id !== c.id)
                            }));
                          }}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Deadline (Optional)</label>
                <input 
                  type="date"
                  className="form-input" 
                  value={form.deadline} 
                  onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} 
                />
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Create (Draft)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {modal === 'config' && selectedExam && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 className="modal-title">Configure Max Marks</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            
            {saving && classSubjects.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner spinner-dark" /></div>
            ) : (
              <form onSubmit={handleConfigSave}>
                {formError && <div className="alert alert-error" style={{ marginBottom: 12 }}>⚠ {formError}</div>}
                
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>
                  Set the maximum marks for each subject in <strong>{selectedExam.name}</strong>.
                </p>

                {classSubjects.length === 0 ? (
                  <div className="alert alert-warning">
                    No subjects found for the enrolled classes. Please go to Classes to add subjects first.
                  </div>
                ) : (
                  <>
                    {selectedExam.examType === 'INTERNAL_EXAM' && (
                      <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #bae6fd' }}>
                        <span style={{ fontSize: '0.85rem', color: '#0369a1', fontWeight: 600 }}>Set all subjects to same marks:</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input 
                            type="number" 
                            className="form-input" 
                            style={{ width: '80px', padding: '4px 8px' }}
                            placeholder="e.g. 100"
                            value={copyToAllValue}
                            onChange={e => setCopyToAllValue(e.target.value)}
                          />
                          <button 
                            type="button" 
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              if (!copyToAllValue) return;
                              const val = Number(copyToAllValue);
                              setMaxMarksValues(prev => {
                                const next = { ...prev };
                                Object.keys(next).forEach(k => next[k] = val);
                                return next;
                              });
                            }}
                          >
                            Apply to all
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
                      {selectedExam.examType === 'INTERNAL_EXAM' ? (
                        groupedSubjects.map(group => {
                          const isExpanded = expandedSections[group.classId];
                          return (
                            <div key={group.classId} style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                              <div 
                                style={{ background: '#f8fafc', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                                onClick={() => setExpandedSections(prev => ({ ...prev, [group.classId]: !isExpanded }))}
                              >
                                <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                  📚 {group.className} <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 400, marginLeft: 8 }}>— {group.studentCount} Students</span>
                                </div>
                                <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 500 }}>
                                  {isExpanded ? '▼ Expand' : '▶ Expand'}
                                </div>
                              </div>
                              {isExpanded && (
                                <div style={{ padding: '12px 16px', background: '#fff' }}>
                                  {group.subjects.length === 0 ? (
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>No subjects in this class.</div>
                                  ) : (
                                    group.subjects.map(sub => (
                                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px dashed #e2e8f0' }}>
                                        <div style={{ fontWeight: 500, color: '#334155' }}>{sub.name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Max Marks:</span>
                                          <input 
                                            type="number" 
                                            step="0.1" 
                                            min="1"
                                            max="999"
                                            className="form-input" 
                                            style={{ width: '80px', padding: '6px' }}
                                            value={maxMarksValues[sub.id] || ''} 
                                            onChange={e => setMaxMarksValues(prev => ({ ...prev, [sub.id]: e.target.value }))} 
                                            required
                                          />
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        // Flat list for CLASS_EXAM
                        classSubjects.map(sub => (
                          <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <div>
                              <div style={{ fontWeight: 600, color: '#334155' }}>📚 {sub.name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Class: {sub.className}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Max Marks:</span>
                              <input 
                                type="number" 
                                step="0.1" 
                                min="1" 
                                max="999"
                                className="form-input" 
                                style={{ width: '90px' }}
                                value={maxMarksValues[sub.id] || ''} 
                                onChange={e => setMaxMarksValues(prev => ({ ...prev, [sub.id]: e.target.value }))} 
                                required
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    
                    {selectedExam.examType === 'INTERNAL_EXAM' && groupedSubjects.length > 0 && (
                      <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#475569', marginBottom: 8 }}>Configuration Summary</div>
                        {groupedSubjects.map(group => {
                          const classTotal = group.subjects.reduce((sum, s) => sum + Number(maxMarksValues[s.id] || 0), 0);
                          const subjectBreakdown = group.subjects.map(s => `${s.name}(${maxMarksValues[s.id] || 0})`).join(' + ');
                          return (
                            <div key={group.classId} style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 4 }}>
                              <strong>{group.className}:</strong> {subjectBreakdown || '0'} = {classTotal} total
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                <div className="modal-footer" style={{ marginTop: 20 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving || classSubjects.length === 0}>
                    {saving ? <span className="spinner" /> : 'Save Configuration'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Publish Modal */}
      {modal === 'publish' && selectedExam && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title">Publish Exam</h2>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="confirm-body">
              <p className="confirm-icon">🚀</p>
              <p className="confirm-msg">Publish <strong>{selectedExam.name}</strong>?</p>
              <p className="confirm-sub">
                Once published, this exam becomes <strong>Open</strong>. Notifications will be sent to the Class Teacher and all assigned Subject Teachers to start entering marks.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={handlePublish}>
                {saving ? <span className="spinner" /> : 'Yes, Publish Exam'}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#dc2626' }}>Delete Exam</h2>
              <button className="modal-close" onClick={() => setDeleteModal(null)}>✕</button>
            </div>
            <div className="confirm-body">
              {deleteModal.status === 'Draft' ? (
                <>
                  <p className="confirm-icon">🗑️</p>
                  <p className="confirm-msg">Are you sure you want to delete <strong>'{deleteModal.name}'</strong>?</p>
                  <p className="confirm-sub">This cannot be undone.</p>
                </>
              ) : deleteModal.status === 'Open' ? (
                <>
                  <p className="confirm-icon" style={{ fontSize: '3rem' }}>⚠️</p>
                  <p className="confirm-msg" style={{ color: '#b45309' }}>WARNING: '{deleteModal.name}' is currently Open.</p>
                  <p className="confirm-sub" style={{ color: '#dc2626', fontWeight: 500 }}>
                    Teachers may have entered marks already.
                    <br/>ALL marks will be permanently deleted.
                  </p>
                  <p className="confirm-sub" style={{ marginTop: 8 }}>
                    Are you sure?
                  </p>
                </>
              ) : (
                <>
                  <p className="confirm-icon" style={{ fontSize: '3rem' }}>⚠️</p>
                  <p className="confirm-msg" style={{ color: '#b45309' }}>WARNING: '{deleteModal.name}' is a completed exam with finalized results.</p>
                  <p className="confirm-sub" style={{ color: '#dc2626', fontWeight: 500 }}>
                    Deleting will permanently remove all marks, results and grade data for all students.
                  </p>
                  <p className="confirm-sub" style={{ marginTop: 8 }}>
                    This CANNOT be undone. Are you sure?
                  </p>
                </>
              )}
            </div>
            <div className="modal-footer" style={{ marginTop: 24 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                style={{ background: '#dc2626', borderColor: '#dc2626' }} 
                disabled={saving} 
                onClick={handleDeleteExam}
              >
                {saving ? <span className="spinner" /> : (deleteModal.status === 'Open' ? 'Yes, Delete Everything' : deleteModal.status === 'Closed' || deleteModal.status === 'Completed' ? 'Yes, Delete Permanently' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      {publishPublicModal && (() => {
        const publishedExam = exams.find(e => e.isPublished);
        return (
          <div className="modal-overlay" onClick={() => setPublishPublicModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
              <div className="modal-header">
                <h2 className="modal-title">Publish Results</h2>
                <button className="modal-close" onClick={() => setPublishPublicModal(null)}>✕</button>
              </div>
              <div className="confirm-body">
                <p className="confirm-icon" style={{ fontSize: '3rem' }}>🌐</p>
                {publishedExam ? (
                  <>
                    <p className="confirm-msg" style={{ color: '#b45309' }}>WARNING</p>
                    <p className="confirm-sub" style={{ fontWeight: 500 }}>
                      This will replace the currently published <strong>'{publishedExam.name}'</strong> results with <strong>'{publishPublicModal.name}'</strong>.
                    </p>
                    <p className="confirm-sub" style={{ marginTop: 8 }}>
                      Parents will see the new results immediately. Continue?
                    </p>
                  </>
                ) : (
                  <>
                    <p className="confirm-msg">Publish results for <strong>'{publishPublicModal.name}'</strong>?</p>
                    <p className="confirm-sub">These results will be instantly visible to parents on the public portal.</p>
                    {publishPublicModal.status === 'Open' && (
                      <div style={{ marginTop: 16, padding: '12px', backgroundColor: '#fffbeb', color: '#b45309', borderRadius: '8px', border: '1px solid #fde68a', fontSize: '0.9rem', textAlign: 'left' }}>
                        <strong>⚠️ Note:</strong> Only finalized classes will be visible to parents. Remaining classes will appear automatically once their Class Teachers finalize.
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="modal-footer" style={{ marginTop: 24 }}>
                <button className="btn btn-ghost" onClick={() => setPublishPublicModal(null)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  disabled={saving} 
                  onClick={handlePublishPublic}
                >
                  {saving ? <span className="spinner" /> : (publishedExam ? 'Yes, Publish New Results' : 'Publish Results')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
