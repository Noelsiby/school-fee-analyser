import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import './admin.css';
import schoolLogo from '../../assets/school-logo.png';

export default function ExamResultsPage() {
  const { id } = useParams();
  const { apiCall } = useApi();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [unlockModal, setUnlockModal] = useState(false);
  const [actioning, setActioning] = useState(false);

  // Export modal state
  const [exportModal, setExportModal] = useState(false);
  const [exportClassId, setExportClassId] = useState('all');
  const [exportFormat, setExportFormat] = useState('excel');

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiCall(`/api/admin/exams/${id}/results`);
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load results.');
    } finally {
      setLoading(false);
    }
  }, [apiCall, id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUnlock = async () => {
    setActioning(true);
    try {
      await apiCall(`/api/admin/exams/${id}/unlock`, { method: 'PUT' });
      setUnlockModal(false);
      navigate('/admin/exams');
    } catch (e) {
      alert(e.message);
      setActioning(false);
    }
  };

  const handleExport = (format) => {
    const classParam = exportClassId !== 'all' ? `?classId=${exportClassId}` : '';
    const endpoint = format === 'excel'
      ? `/api/admin/exams/${id}/export/excel${classParam}`
      : `/api/admin/exams/${id}/export/word${classParam}`;
    window.location.href = endpoint;
    setExportModal(false);
  };

  if (loading) return <div className="admin-page"><div className="empty-state"><div className="spinner spinner-dark" /></div></div>;
  if (error) return <div className="admin-page"><div className="empty-state"><p style={{ color: '#dc2626' }}>⚠ {error}</p><button className="btn btn-primary" onClick={() => navigate('/admin/exams')}>Back to Exams</button></div></div>;

  const exam = data?.exam;
  const classResults = data?.classResults || [];

  return (
    <div className="admin-page">
      {/* Print-only header */}
      <div className="print-only-header" style={{ display: 'none', textAlign: 'center', marginBottom: 16 }}>
        <img src={schoolLogo} alt="School Logo" style={{ height: 60, marginBottom: 8 }} />
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Matha English Medium School</h1>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '4px 0', color: '#374151' }}>{exam.name} Results</h2>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>Academic Year 2026-27</p>
      </div>

      <style>{`
        @media print {
          /* Hide all UI chrome */
          .sidebar, .navbar, nav, .detail-breadcrumb, .page-header,
          .export-buttons, .alert-warning, .unlock-btn, .modal-overlay {
            display: none !important;
          }

          /* Full width for print */
          .admin-page {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            width: 100% !important;
          }

          /* Show print header */
          .print-only-header {
            display: block !important;
          }

          /* Landscape A4 */
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          /* Table adjustments */
          .data-card {
            box-shadow: none !important;
            border: 1px solid #ccc !important;
            overflow: visible !important;
          }

          table {
            width: 100% !important;
            font-size: 8px !important;
            border-collapse: collapse !important;
            white-space: normal !important;
          }

          th, td {
            padding: 2px 4px !important;
            border: 1px solid #aaa !important;
            word-break: break-word !important;
          }

          /* Class sections page breaks */
          .print-section {
            page-break-before: always !important;
          }

          .print-section:first-child {
            page-break-before: avoid !important;
          }

          h2 {
            font-size: 11px !important;
            margin: 8px 0 4px !important;
          }

          /* Hide sticky positioning in print */
          td[style*="sticky"], th[style*="sticky"] {
            position: static !important;
          }
        }
      `}</style>

      <div className="detail-breadcrumb">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/exams')}>← Exams</button>
        <span style={{ color: '#94a3b8', margin: '0 6px' }}>/</span>
        <span style={{ fontWeight: 600 }}>{exam.name} Results</span>
      </div>

      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">{exam.name} Results</h1>
          <p className="page-sub">
            {exam.examType === 'INTERNAL_EXAM' ? 'Multi-Class Exam' : (exam.class?.name || 'Class Exam')}
            {' '}·{' '}
            {data.classResults.reduce((acc, c) => acc + c.studentCount, 0)} Students
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }} className="export-buttons">
          {exam.isLocked && (
            <button 
              className="btn btn-ghost unlock-btn" 
              style={{ color: '#dc2626', borderColor: '#fecaca' }}
              onClick={() => setUnlockModal(true)}
            >
              🔓 Unlock Exam
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ background: '#059669', borderColor: '#059669' }}
            onClick={() => { setExportModal(true); setExportClassId('all'); }}
          >
            📊 Export Excel
          </button>
          <button
            className="btn btn-primary"
            style={{ background: '#2563eb', borderColor: '#2563eb' }}
            onClick={() => { setExportModal(true); setExportClassId('all'); }}
          >
            📝 Export Word
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            🖨️ Print
          </button>
        </div>
      </div>

      {!exam.isLocked && exam.status === 'Open' && (
        <div className="alert alert-warning" style={{ marginBottom: 24 }}>
          ⚠️ This exam is currently OPEN. The results below may be incomplete or subject to change until finalized by the Class Teacher.
        </div>
      )}

      {/* Summary Card for Internal Exams */}
      {exam.examType === 'INTERNAL_EXAM' && (
        <div className="data-card" style={{ marginBottom: 24, padding: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, color: '#0f172a' }}>Exam Summary</h3>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase' }}>Total Classes</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{classResults.length}</div>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase' }}>Total Students</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{classResults.reduce((acc, c) => acc + c.studentCount, 0)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase' }}>Class Breakdown</span>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: 4 }}>
                {classResults.map(cls => (
                  <span key={cls.classId} style={{ background: '#f1f5f9', padding: '4px 12px', borderRadius: 16, fontSize: '0.9rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {cls.className}: {cls.studentCount}
                    {cls.status === 'Finalized' ? '✅' : '⏳'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Render tables per class */}
      {classResults.map((cls, idx) => (
        <div key={cls.classId} className="print-section" style={{ pageBreakBefore: idx > 0 ? 'always' : 'auto', marginBottom: 40 }}>
          {exam.examType === 'INTERNAL_EXAM' && (
            <h2 style={{ color: '#1e293b', marginBottom: 12, fontSize: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {cls.className} <span style={{ color: '#64748b', fontSize: '1rem', fontWeight: 400 }}>— {cls.studentCount} Students</span>
              </div>
              <div>
                {cls.status === 'Finalized' ? (
                  <span style={{ fontSize: '0.9rem', color: '#16a34a', fontWeight: 'bold' }}>✅ Finalized</span>
                ) : (
                  <span style={{ fontSize: '0.9rem', color: '#d97706', fontWeight: 'bold' }}>⏳ {cls.status}</span>
                )}
              </div>
            </h2>
          )}
          
          {cls.status !== 'Finalized' ? (
            <div className="alert alert-warning" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d', padding: 16, borderRadius: 8 }}>
              ⏳ Waiting for Class Teacher to finalize marks for {cls.className}.
            </div>
          ) : (
            <div className="data-card" style={{ overflowX: 'auto', margin: 0 }}>
            <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 10 }}>Roll No</th>
                  <th style={{ position: 'sticky', left: '70px', background: '#f8fafc', zIndex: 10, borderRight: '2px solid #e2e8f0' }}>Student Name</th>
                  {cls.subjects.map(sub => (
                    <th key={sub.id} style={{ textAlign: 'center' }}>
                      <div>{sub.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Max: {sub.maxMarks}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', background: '#f0f9ff' }}>Total</th>
                  <th style={{ textAlign: 'center', background: '#f0f9ff' }}>Percentage</th>
                  <th style={{ textAlign: 'center', background: '#f0f9ff' }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {cls.results.map((row) => (
                  <tr key={row.student.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>{row.student.rollNumber}</td>
                    <td style={{ position: 'sticky', left: '70px', background: 'white', zIndex: 1, borderRight: '2px solid #e2e8f0', fontWeight: 500 }}>
                      {row.student.name}
                    </td>
                    {cls.subjects.map(sub => {
                      const val = row.subjects[sub.id];
                      const isFail = val !== null && val < (sub.maxMarks * 0.4);
                      return (
                        <td key={sub.id} style={{ textAlign: 'center', color: isFail ? '#dc2626' : 'inherit', fontWeight: isFail ? 600 : 400 }}>
                          {val !== null ? val : '—'}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center', background: '#f8fafc', fontWeight: 600 }}>{row.totalMarks} / {row.totalMaxMarks}</td>
                    <td style={{ textAlign: 'center', background: '#f8fafc', fontWeight: 700, color: row.percentage >= 80 ? '#059669' : row.percentage < 40 ? '#dc2626' : '#1e3a8a' }}>
                      {row.percentage}%
                    </td>
                    <td style={{ textAlign: 'center', background: '#f8fafc', fontWeight: 700 }}>
                      <span className={`badge ${['A+', 'A', 'B'].includes(row.grade) ? 'badge-green' : row.grade === 'F' ? 'badge-red' : 'badge-gray'}`}>
                        {row.grade || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
                {cls.results.length === 0 && (
                  <tr>
                    <td colSpan={cls.subjects.length + 5} style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                      No students found for this class.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      ))}

      {/* Export Modal */}
      {exportModal && (
        <div className="modal-overlay" onClick={() => setExportModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">📥 Export Results</h2>
              <button className="modal-close" onClick={() => setExportModal(false)}>✕</button>
            </div>

            <div style={{ padding: '4px 0 16px' }}>
              <p className="form-label" style={{ marginBottom: 10 }}>Select Class</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `2px solid ${exportClassId === 'all' ? '#1E3A8A' : '#e2e8f0'}`, cursor: 'pointer', background: exportClassId === 'all' ? '#eff6ff' : 'white' }}>
                  <input type="radio" value="all" checked={exportClassId === 'all'} onChange={() => setExportClassId('all')} />
                  <span>
                    <strong>All Classes (Combined)</strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: 8 }}>
                      {classResults.length} classes · {classResults.reduce((a, c) => a + c.studentCount, 0)} students
                    </span>
                  </span>
                </label>
                {classResults.map(cls => (
                  <label key={cls.classId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `2px solid ${exportClassId === String(cls.classId) ? '#1E3A8A' : '#e2e8f0'}`, cursor: 'pointer', background: exportClassId === String(cls.classId) ? '#eff6ff' : 'white' }}>
                    <input type="radio" value={String(cls.classId)} checked={exportClassId === String(cls.classId)} onChange={() => setExportClassId(String(cls.classId))} />
                    <span>
                      <strong>{cls.className}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: 8 }}>
                        {cls.studentCount} students · {cls.status === 'Finalized' ? '✅ Finalized' : '⏳ Pending'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setExportModal(false)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                style={{ background: '#059669', borderColor: '#059669' }} 
                onClick={() => handleExport('excel')}
              >
                📊 Export Excel
              </button>
              <button 
                className="btn btn-primary" 
                style={{ background: '#2563eb', borderColor: '#2563eb' }} 
                onClick={() => handleExport('word')}
              >
                📝 Export Word
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Modal */}
      {unlockModal && (
        <div className="modal-overlay" onClick={() => setUnlockModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: '#dc2626' }}>Unlock Exam?</h2>
              <button className="modal-close" onClick={() => setUnlockModal(false)}>✕</button>
            </div>
            <div className="confirm-body">
              <p className="confirm-icon">🔓</p>
              <p className="confirm-msg">Revert <strong>{exam.name}</strong> back to Open?</p>
              <p className="confirm-sub">
                This is a safety hatch. It will revoke the Class Teacher's finalization and revert all approved marks back to "Submitted" status, allowing the Class Teacher to reject marks again. A notification will be sent to the Class Teacher.
              </p>
            </div>
            <div className="modal-footer" style={{ marginTop: 24 }}>
              <button className="btn btn-ghost" onClick={() => setUnlockModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }} onClick={handleUnlock} disabled={actioning}>
                {actioning ? <span className="spinner" /> : 'Yes, Unlock Exam'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
