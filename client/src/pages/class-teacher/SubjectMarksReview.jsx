import { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import MarkEditor from '../../components/MarkEditor';
import { MAIN, partKeys, partsLabel, keyLabel } from '../../utils/subjectParts';

const editedBadge = (
  <span style={{
    position: 'absolute', top: 4, right: 4,
    fontSize: '0.6rem', background: '#fef3c7',
    color: '#d97706', padding: '2px 4px',
    borderRadius: 4, fontWeight: 'bold'
  }} title="Edited">✏️</span>
);

export default function SubjectMarksReview({ examId, classId, subjectId, onClose, isLocked }) {
  const { apiCall } = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingMarkId, setEditingMarkId] = useState(null);
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

  const handleSave = async (markId, body) => {
    setSaving(true);
    try {
      await apiCall('/api/class-teacher/marks/edit', { method: 'PUT', body: { markId, ...body } });
      setEditingMarkId(null);
      loadMarks();
    } catch (e) {
      alert(e.message || 'Failed to update marks');
    } finally {
      setSaving(false);
    }
  };

  const isSplit = !!data?.componentMaxMarks;
  const keys = partKeys(data?.componentMaxMarks); // e.g. ['Main', 'Reading', 'Writing']
  const canEdit = (row) => !isLocked && !!row.markRecord;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isSplit ? 900 : 800, width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2 className="modal-title">
            Review Marks: {data ? data.subject.name : 'Loading...'}
            {isSplit && <span className="badge badge-purple" style={{ marginLeft: 8, verticalAlign: 'middle' }}>{partsLabel(keys.filter(k => k !== MAIN))}</span>}
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div className="spinner spinner-dark" style={{ margin: '40px auto' }} />
          ) : error ? (
            <div className="alert alert-error" style={{ margin: '20px 0' }}>⚠ {error}</div>
          ) : (
            <>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                    <tr>
                      <th>Roll No</th>
                      <th>Student Name</th>
                      {isSplit && keys.map(k => (
                        <th key={k} style={{ textAlign: 'center' }}>{keyLabel(k, data.subject.name)} <span style={{ fontWeight: 400, color: '#94a3b8' }}>/{data.componentMaxMarks[k]}</span></th>
                      ))}
                      <th style={{ textAlign: 'center' }}>{isSplit ? 'Total' : 'Marks Obtained'}</th>
                      <th style={{ textAlign: 'center' }}>Max Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((row) => {
                      const editing = editingMarkId === row.markRecord?.id;
                      const edited = row.markRecord && row.markRecord.lastEditedById !== row.markRecord.enteredById;
                      const startEdit = () => { if (canEdit(row) && !editing) setEditingMarkId(row.markRecord.id); };
                      const cellProps = {
                        onClick: startEdit,
                        title: canEdit(row) ? 'Click to edit' : '',
                        style: { textAlign: 'center', cursor: canEdit(row) ? 'pointer' : 'default', position: 'relative' },
                      };

                      return (
                        <tr key={row.student.id} style={{ background: editing ? '#f8fafc' : undefined }}>
                          <td style={{ color: '#64748b' }}>{row.student.rollNumber}</td>
                          <td style={{ fontWeight: 500 }}>{row.student.name}</td>

                          {editing ? (
                            <td colSpan={isSplit ? keys.length + 1 : 1} style={{ textAlign: 'center' }}>
                              <MarkEditor
                                markRecord={row.markRecord}
                                maxMarks={data.maxMarks}
                                componentMaxMarks={data.componentMaxMarks}
                                saving={saving}
                                color="#059669"
                                onSave={body => handleSave(row.markRecord.id, body)}
                                onCancel={() => setEditingMarkId(null)}
                              />
                            </td>
                          ) : (
                            <>
                              {isSplit && keys.map(k => (
                                <td key={k} {...cellProps}>{row.markRecord?.componentMarks?.[k] ?? '—'}</td>
                              ))}
                              <td {...cellProps}>
                                <span style={{ fontWeight: 600 }}>{row.marksObtained ?? '—'}</span>
                                {edited && editedBadge}
                              </td>
                            </>
                          )}
                          <td style={{ textAlign: 'center', color: '#64748b' }}>{data.maxMarks}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

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
