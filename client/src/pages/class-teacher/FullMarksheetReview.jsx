import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';

export default function FullMarksheetReview({ examId, classId, isLocked }) {
  const { apiCall } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMarksheet = async () => {
    try {
      const res = await apiCall(`/api/class-teacher/exams/${examId}/full-marksheet?classId=${classId}`);
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load marksheet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarksheet();
  }, [examId, classId]);

  const handleEditClick = (studentId, subjectId, currentMarks, maxMarks) => {
    if (isLocked) return;
    setEditingCell({ studentId, subjectId, maxMarks });
    setEditValue(currentMarks !== null ? String(currentMarks) : '');
  };

  const handleSaveEdit = async (markId) => {
    if (saving) return;
    const val = Number(editValue);
    if (isNaN(val) || val < 0 || val > editingCell.maxMarks) {
      alert(`Marks must be between 0 and ${editingCell.maxMarks}`);
      return;
    }

    setSaving(true);
    try {
      await apiCall('/api/class-teacher/marks/edit', {
        method: 'PUT',
        body: { markId, newMarks: val }
      });
      setEditingCell(null);
      loadMarksheet(); // reload to get new totals and highlight
    } catch (e) {
      alert(e.message || 'Failed to update marks');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e, markId) => {
    if (e.key === 'Enter') handleSaveEdit(markId);
    if (e.key === 'Escape') setEditingCell(null);
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner spinner-dark" /></div>;
  if (error) return <div style={{ color: '#dc2626', padding: 20 }}>⚠ {error}</div>;

  return (
    <div className="data-card" style={{ marginTop: 24, overflowX: 'auto' }}>
      <h2 style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', margin: 0, fontSize: '1.1rem' }}>
        Full Marksheet Review
      </h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Roll No</th>
            {data.subjects.map(sub => (
              <th key={sub.id} style={{ textAlign: 'center' }}>
                {sub.name}
              </th>
            ))}
            <th style={{ textAlign: 'center' }}>Total</th>
            <th style={{ textAlign: 'center' }}>%</th>
            <th style={{ textAlign: 'center' }}>Grade</th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((row) => (
            <tr key={row.student.id}>
              <td style={{ fontWeight: 500 }}>{row.student.name}</td>
              <td style={{ color: '#64748b' }}>{row.student.rollNumber}</td>
              
              {data.subjects.map(sub => {
                const markRecord = row.marksBySubject[sub.id];
                const isEditing = editingCell?.studentId === row.student.id && editingCell?.subjectId === sub.id;
                
                // Find maxMarks for this subject from the config
                const config = data.exam.subjectConfigs.find(c => c.subjectId === sub.id);
                const maxMarks = config ? config.maxMarks : 100;
                
                return (
                  <td 
                    key={sub.id} 
                    style={{ 
                      textAlign: 'center',
                      cursor: !isLocked && markRecord && ['SubmittedToClassTeacher', 'Approved'].includes(markRecord.status) ? 'pointer' : 'default',
                      background: isEditing ? '#f8fafc' : 'transparent',
                      position: 'relative'
                    }}
                    onClick={() => {
                      if (!isEditing && markRecord && ['SubmittedToClassTeacher', 'Approved'].includes(markRecord.status)) {
                        handleEditClick(row.student.id, sub.id, markRecord.marksObtained, maxMarks);
                      }
                    }}
                    title={!isLocked && markRecord && ['SubmittedToClassTeacher', 'Approved'].includes(markRecord.status) ? "Click to edit" : ""}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <input
                          type="number"
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => handleKeyDown(e, markRecord.id)}
                          style={{ width: 60, padding: '4px', textAlign: 'center', border: '2px solid #2563eb', borderRadius: 4 }}
                          disabled={saving}
                        />
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleSaveEdit(markRecord.id); }}
                          disabled={saving}
                          style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '0 8px' }}
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <>
                        {markRecord?.marksObtained ?? '—'}
                        {markRecord && markRecord.lastEditedById !== markRecord.enteredById && (
                          <span style={{ 
                            position: 'absolute', top: 4, right: 4, 
                            fontSize: '0.6rem', background: '#fef3c7', 
                            color: '#d97706', padding: '2px 4px', 
                            borderRadius: 4, fontWeight: 'bold' 
                          }} title="Edited">✏️</span>
                        )}
                      </>
                    )}
                  </td>
                );
              })}

              <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.totalMarks}</td>
              <td style={{ textAlign: 'center' }}>{row.percentage}{row.percentage !== '—' && '%'}</td>
              <td style={{ textAlign: 'center' }}>
                <span className={`badge ${['A+', 'A'].includes(row.grade) ? 'badge-green' : ['B', 'C'].includes(row.grade) ? 'badge-blue' : row.grade === 'F' ? 'badge-red' : 'badge-gray'}`}>
                  {row.grade}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
