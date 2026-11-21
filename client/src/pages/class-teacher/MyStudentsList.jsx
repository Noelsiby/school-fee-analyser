import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { formatPhone } from '../../utils/whatsappStatus';
import { byRoll } from '../../utils/rollOrder';
import '../students/StudentProfile.css';

/** The class teacher's students. classId: show that class (e.g. the exam being reviewed). */
export default function MyStudentsList({ classId: fixedClassId, alwaysOpen = false } = {}) {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(alwaysOpen);
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState(fixedClassId || '');

  useEffect(() => {
    const loadStudents = async () => {
      try {
        const res = await apiCall(`/api/class-teacher/my-students${chosen ? `?classId=${chosen}` : ''}`);
        setData(res);
      } catch (err) {
        setError(err.message || 'Failed to load students');
      } finally {
        setLoading(false);
      }
    };
    loadStudents();
  }, [apiCall, chosen]);

  if (loading) return <div className="spinner spinner-dark" style={{ margin: '20px 0' }} />;
  if (error) return null; // If they don't have a class, just hide it
  if (!data || !data.students) return null;

  return (
    <div className="data-card" style={{ marginBottom: 32, borderTop: '4px solid #059669' }}>
      <div 
        style={{ 
          padding: '16px 20px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'pointer'
        }}
        onClick={() => { if (!alwaysOpen) setIsExpanded(!isExpanded); }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {fixedClassId ? 'Students' : 'My Class'}:{' '}
            {!fixedClassId && data.classes?.length > 1 ? (
              <select className="form-select" style={{ width: 'auto', fontSize: '1rem', fontWeight: 700 }} value={data.classId}
                onClick={(e) => e.stopPropagation()} onChange={(e) => setChosen(e.target.value)} aria-label="Class">
                {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : data.className}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            {data.totalStudents} Students · click a name for the profile and progress reports
          </p>
        </div>
        {alwaysOpen ? (
          <input className="form-input" style={{ maxWidth: 240 }} placeholder="🔎 Search name or roll…" value={search}
            onClick={(e) => e.stopPropagation()} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
        ) : (
          <button className="btn btn-ghost" style={{ padding: '8px', color: '#64748b' }}>
            {isExpanded ? '▲ Hide List' : '▼ Show List'}
          </button>
        )}
      </div>

      {isExpanded && (
        <div style={{ borderTop: '1px solid #e2e8f0' }}>
          <div style={alwaysOpen ? undefined : { maxHeight: '400px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr>
                  <th style={{ width: '100px', textAlign: 'center' }}>Roll No</th>
                  <th>Student Name</th>
                  <th>Parent Cell</th>
                </tr>
              </thead>
              <tbody>
                {[...data.students].sort(byRoll)
                  .filter(s => !search.trim() || s.name.toLowerCase().includes(search.trim().toLowerCase()) || String(s.rollNumber) === search.trim())
                  .map(s => (
                  <tr key={s.id}>
                    <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 500 }}>{s.rollNumber}</td>
                    <td><button className="cr-link" onClick={() => navigate(`/class-teacher/students/${s.id}`)}>{s.name}</button></td>
                    <td>{s.parentPhone ? formatPhone(s.parentPhone) : <span className="cr-muted">Not added</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
