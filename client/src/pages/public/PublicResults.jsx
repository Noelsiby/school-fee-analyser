import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';
import '../admin/admin.css';

export default function PublicResults() {
  const { apiCall } = useApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publishedExam, setPublishedExam] = useState(null);
  const [classes, setClasses] = useState([]);
  
  // If a class is selected, we fetch its detailed results
  const [selectedClass, setSelectedClass] = useState(null);
  const [classData, setClassData] = useState(null);
  const [loadingClass, setLoadingClass] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiCall('/api/public/classes');
      setPublishedExam(res.publishedExam);
      setClasses(res.classes);
    } catch (e) {
      setError(e.message || 'Failed to load public results.');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSelectClass = async (cls) => {
    setSelectedClass(cls);
    setLoadingClass(true);
    try {
      const res = await apiCall(`/api/public/classes/${cls.id}/results`);
      // Re-calculate the marks same as admin side
      const { subjectConfigs, marks, class: classInfo } = res;
      
      const studentsMap = {};
      classInfo.students.forEach(st => {
        studentsMap[st.id] = {
          student: st,
          subjects: {},
          totalMarks: 0,
          totalMaxMarks: 0
        };
        subjectConfigs.forEach(sub => {
          studentsMap[st.id].subjects[sub.subjectId] = null;
        });
      });

      marks.forEach(m => {
        if (studentsMap[m.studentId] && m.marks !== null) {
          studentsMap[m.studentId].subjects[m.subjectId] = m.marks;
          studentsMap[m.studentId].totalMarks += m.marks;
        }
      });

      const subjectsList = subjectConfigs.map(c => ({
        id: c.subjectId,
        name: c.subject.name,
        maxMarks: c.maxMarks
      }));

      const results = Object.values(studentsMap).map(row => {
        let maxMarksForStudent = 0;
        subjectConfigs.forEach(sub => {
          if (row.subjects[sub.subjectId] !== null) {
            maxMarksForStudent += sub.maxMarks;
          }
        });
        row.totalMaxMarks = maxMarksForStudent;
        row.percentage = maxMarksForStudent > 0 ? ((row.totalMarks / maxMarksForStudent) * 100).toFixed(2) : 0;
        
        let grade = 'F';
        if (row.percentage >= 90) grade = 'A+';
        else if (row.percentage >= 80) grade = 'A';
        else if (row.percentage >= 70) grade = 'B';
        else if (row.percentage >= 60) grade = 'C';
        else if (row.percentage >= 50) grade = 'D';

        row.grade = grade;
        return row;
      });

      results.sort((a, b) => {
        const rollA = a.student.rollNumber ? String(a.student.rollNumber).padStart(10, '0') : 'Z';
        const rollB = b.student.rollNumber ? String(b.student.rollNumber).padStart(10, '0') : 'Z';
        return rollA.localeCompare(rollB);
      });

      setClassData({
        subjects: subjectsList,
        results
      });

    } catch (e) {
      setError(e.message || 'Failed to load class results.');
    } finally {
      setLoadingClass(false);
    }
  };

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner spinner-dark" /></div>;

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: '#dc2626', fontSize: '1.2rem' }}>⚠ {error}</p>
    </div>
  );

  if (!publishedExam) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <img src="/assets/school-logo.png" alt="Matha English Medium School" style={{ width: 120, height: 120, marginBottom: 24, objectFit: 'contain' }} onError={(e) => e.target.style.display = 'none'} />
        <h1 style={{ fontSize: '2rem', color: '#0f172a', marginBottom: 12 }}>📋 Results Not Yet Published</h1>
        <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: 32 }}>Please check back later or contact the school.</p>
        
        <div style={{ padding: 24, background: 'white', borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Matha English Medium School</h3>
          <p style={{ margin: 0, color: '#64748b' }}>Kaikalur, Andhra Pradesh</p>
          <p style={{ margin: '8px 0 0 0', color: '#64748b' }}>Phone: +91 99999 99999</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9' }}>
      
      <header style={{ background: 'white', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src="/assets/school-logo.png" alt="Logo" style={{ height: 48 }} onError={(e) => e.target.style.display = 'none'} />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Matha English Medium School</h2>
            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Public Results Portal</div>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: '32px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{ background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', color: '#0f172a' }}>Results for: {publishedExam.name}</h1>
              <div style={{ color: '#64748b', fontSize: '0.95rem' }}>
                Published on: {new Date(publishedExam.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
            {selectedClass && (
              <button className="btn btn-ghost" onClick={() => setSelectedClass(null)}>
                ← Back to Classes
              </button>
            )}
          </div>
        </div>

        {!selectedClass ? (
          <div>
            <h2 style={{ fontSize: '1.25rem', color: '#1e293b', marginBottom: 16 }}>Select a Class</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 24 }}>
              {classes.map(cls => (
                <div 
                  key={cls.id} 
                  style={{ background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer', borderTop: '4px solid #3b82f6', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onClick={() => handleSelectClass(cls)}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a' }}>{cls.name}</h3>
                  <p style={{ margin: '8px 0 0 0', color: '#3b82f6', fontWeight: 500 }}>View Marksheet →</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: '1.5rem', color: '#1e293b', marginBottom: 16 }}>{selectedClass.name} - Detailed Marksheet</h2>
            
            {loadingClass ? (
              <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner spinner-dark" /></div>
            ) : classData ? (
              <div className="data-card" style={{ overflowX: 'auto', margin: 0 }}>
                <table className="data-table" style={{ whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: '#f8fafc', zIndex: 10 }}>Roll No</th>
                      <th style={{ position: 'sticky', left: '70px', background: '#f8fafc', zIndex: 10, borderRight: '2px solid #e2e8f0' }}>Student Name</th>
                      {classData.subjects.map(sub => (
                        <th key={sub.id} style={{ textAlign: 'center' }}>
                          <div>{sub.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Max: {sub.maxMarks}</div>
                        </th>
                      ))}
                      <th style={{ textAlign: 'center', background: '#f0f9ff' }}>Total</th>
                      <th style={{ textAlign: 'center', background: '#f0f9ff' }}>%</th>
                      <th style={{ textAlign: 'center', background: '#f0f9ff' }}>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classData.results.map((row) => (
                      <tr key={row.student.id}>
                        <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>{row.student.rollNumber}</td>
                        <td style={{ position: 'sticky', left: '70px', background: 'white', zIndex: 1, borderRight: '2px solid #e2e8f0', fontWeight: 500 }}>
                          {row.student.name}
                        </td>
                        {classData.subjects.map(sub => {
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
                    {classData.results.length === 0 && (
                      <tr>
                        <td colSpan={classData.subjects.length + 5} style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>
                          No students found for this class.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}
      </main>

      <footer style={{ background: 'white', padding: 24, textAlign: 'center', color: '#64748b', borderTop: '1px solid #e2e8f0' }}>
        <p style={{ margin: 0, fontSize: '0.95rem' }}>© {new Date().getFullYear()} Matha English Medium School, Kaikalur</p>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>Powered by Matha Exam Manager</p>
      </footer>
    </div>
  );
}
