import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import MarkEditor from '../../components/MarkEditor';
import { partsSummary } from '../../utils/subjectParts';

export default function FullMarksheetReview({ examId, classId, isLocked }) {
  const { apiCall } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [editingCell, setEditingCell] = useState(null); // { studentId, subjectId }
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

  const handleEditClick = (studentId, subjectId) => {
    if (isLocked) return;
    setEditingCell({ studentId, subjectId });
  };

  const handleSaveEdit = async (markId, body) => {
    setSaving(true);
    try {
      await apiCall('/api/class-teacher/marks/edit', {
        method: 'PUT',
        body: { markId, ...body }
      });
      setEditingCell(null);
      loadMarksheet(); // reload to get new totals and highlight
    } catch (e) {
      alert(e.message || 'Failed to update marks');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner spinner-dark" /></div>;
  if (error) return <div style={{ color: '#dc2626', padding: 20 }}>⚠ {error}</div>;

  const totalMaxMarks = data?.subjects?.reduce((sum, sub) => sum + (sub.maxMarks ?? 100), 0) || 0;

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
                <div>{sub.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'normal', marginTop: 4 }}>
                  Max: {sub.maxMarks}
                </div>
                {sub.componentMaxMarks && (
                  <div style={{ fontSize: '0.68rem', color: '#6d28d9', fontWeight: 'normal' }}>
                    {partsSummary(sub.componentMaxMarks)}
                  </div>
                )}
              </th>
            ))}
            <th style={{ textAlign: 'center' }}>
              <div>Total</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'normal', marginTop: 4 }}>
                / {totalMaxMarks}
              </div>
            </th>
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
                        handleEditClick(row.student.id, sub.id);
                      }
                    }}
                    title={!isLocked && markRecord && ['SubmittedToClassTeacher', 'Approved'].includes(markRecord.status) ? "Click to edit" : ""}
                  >
                    {isEditing ? (
                      <MarkEditor
                        markRecord={markRecord}
                        maxMarks={sub.maxMarks}
                        componentMaxMarks={sub.componentMaxMarks}
                        saving={saving}
                        onSave={body => handleSaveEdit(markRecord.id, body)}
                        onCancel={() => setEditingCell(null)}
                      />
                    ) : (
                      <>
                        {markRecord?.marksObtained ?? '—'}
                        {sub.componentMaxMarks && markRecord?.componentMarks && (
                          <div style={{ fontSize: '0.68rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {partsSummary(markRecord.componentMarks)}
                          </div>
                        )}
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

              <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                {row.totalMarks !== '—' ? `${row.totalMarks} / ${totalMaxMarks}` : '—'}
              </td>
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
