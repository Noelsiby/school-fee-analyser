import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';

export default function SubjectMarksReview({ examId, classId, subjectId, onClose, isLocked }) {
  const { apiCall } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingMarkId, setEditingMarkId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMarks = async () => {
    try {
      const res = await apiCall(`/api/class-teacher/exams/${examId}/subjects/${subjectId}/marks?classId=${classId}`);
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load marks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarks();
  }, [examId, classId, subjectId]);

  const handleEditClick = (markRecord) => {
    if (isLocked) return;
    setEditingMarkId(markRecord.id);
    setEditValue(markRecord.marksObtained !== null ? String(markRecord.marksObtained) : '');
  };

  const handleSaveEdit = async (markId) => {
    if (saving) return;
    const val = Number(editValue);
    if (isNaN(val) || val < 0 || val > data.maxMarks) {
      alert(`Marks must be between 0 and ${data.maxMarks}`);
      return;
    }

    setSaving(true);
    try {
      await apiCall('/api/class-teacher/marks/edit', {
        method: 'PUT',
        body: { markId, newMarks: val }
      });
      setEditingMarkId(null);
      loadMarks();
    } catch (e) {
      alert(e.message || 'Failed to update marks');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e, markId) => {
    if (e.key === 'Enter') handleSaveEdit(markId);
    if (e.key === 'Escape') setEditingMarkId(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2 className="modal-title">Review Marks: {data ? data.subject.name : 'Loading...'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px 20px' }}>
          {loading ? (
            <div className="spinner spinner-dark" style={{ margin: '40px auto' }} />
          ) : error ? (
            <div className="alert alert-error" style={{ margin: '20px 0' }}>⚠ {error}</div>
          ) : (
            <>
              <table className="data-table" style={{ marginTop: 16 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  <tr>
                    <th>Roll No</th>
                    <th>Student Name</th>
                    <th style={{ textAlign: 'center' }}>Marks Obtained</th>
                    <th style={{ textAlign: 'center' }}>Max Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((row) => (
                    <tr key={row.student.id}>
                      <td style={{ color: '#64748b' }}>{row.student.rollNumber}</td>
                      <td style={{ fontWeight: 500 }}>{row.student.name}</td>
                      <td 
                        style={{ 
                          textAlign: 'center',
                          cursor: !isLocked && row.markRecord ? 'pointer' : 'default',
                          background: editingMarkId === row.markRecord?.id ? '#f8fafc' : 'transparent',
                          position: 'relative'
                        }}
                        onClick={() => {
                          if (!isLocked && row.markRecord && editingMarkId !== row.markRecord.id) {
                            handleEditClick(row.markRecord);
                          }
                        }}
                        title={!isLocked && row.markRecord ? "Click to edit" : ""}
                      >
                        {editingMarkId === row.markRecord?.id ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <input
                              type="number"
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => handleKeyDown(e, row.markRecord.id)}
                              style={{ width: 60, padding: '4px', textAlign: 'center', border: '2px solid #059669', borderRadius: 4 }}
                              disabled={saving}
                            />
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleSaveEdit(row.markRecord.id); }}
                              disabled={saving}
                              style={{ background: '#059669', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '0 8px' }}
                            >
                              ✓
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: 600 }}>
                            {row.marksObtained !== null ? row.marksObtained : '—'}
                            {row.markRecord && row.markRecord.lastEditedById !== row.markRecord.enteredById && (
                              <span style={{ 
                                position: 'absolute', top: 4, right: 4, 
                                fontSize: '0.6rem', background: '#fef3c7', 
                                color: '#d97706', padding: '2px 4px', 
                                borderRadius: 4, fontWeight: 'bold' 
                              }} title="Edited">✏️</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', color: '#64748b' }}>{data.maxMarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              <div style={{ display: 'flex', justifyContent: 'space-around', background: '#f8fafc', padding: 16, borderRadius: 8, marginTop: 24, border: '1px solid #e2e8f0' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Class Average</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0f172a' }}>{data.stats.average ?? '—'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Highest</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>{data.stats.highest ?? '—'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Lowest</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>{data.stats.lowest ?? '—'}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
