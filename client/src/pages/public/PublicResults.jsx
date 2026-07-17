import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import './PublicResults.css';
import schoolLogo from '../../assets/school-logo.png';

// CountUp component for animating numbers
const CountUp = ({ end, duration = 1000, suffix = '', decimals = 0 }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(easeProgress * end);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [end, duration]);

  return <span>{count.toFixed(decimals)}{suffix}</span>;
};

export default function PublicResults() {
  const { apiCall } = useApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publishedExam, setPublishedExam] = useState(null);
  const [classes, setClasses] = useState([]);
  
  const [selectedClass, setSelectedClass] = useState(null);
  const [classData, setClassData] = useState(null);
  const [loadingClass, setLoadingClass] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Swipe logic
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isRightSwipe && selectedClass) {
      handleBack();
    }
  };

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
    setSearchTerm('');
    try {
      const res = await apiCall(`/api/public/classes/${cls.id}/results`);
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
        let attemptCount = 0;
        subjectConfigs.forEach(sub => {
          if (row.subjects[sub.subjectId] !== null) {
            maxMarksForStudent += sub.maxMarks;
            attemptCount++;
          }
        });
        row.totalMaxMarks = maxMarksForStudent;
        row.percentage = maxMarksForStudent > 0 ? (row.totalMarks / maxMarksForStudent) * 100 : 0;
        
        let grade = 'F';
        if (row.percentage >= 90) grade = 'A+';
        else if (row.percentage >= 80) grade = 'A';
        else if (row.percentage >= 70) grade = 'B';
        else if (row.percentage >= 60) grade = 'C';
        else if (row.percentage >= 50) grade = 'D';

        row.grade = grade;
        row.hasMarks = attemptCount > 0;
        return row;
      });

      // Sort by percentage for rank calculation, then assign ranks
      const rankedResults = [...results].sort((a, b) => b.percentage - a.percentage);
      let currentRank = 1;
      let currentScore = -1;
      let ties = 0;
      
      rankedResults.forEach((r, idx) => {
        if (!r.hasMarks) {
          r.rank = null;
          return;
        }
        if (currentScore === -1 || r.percentage === currentScore) {
          r.rank = currentRank;
          ties++;
          currentScore = r.percentage;
        } else {
          currentRank += ties;
          r.rank = currentRank;
          ties = 1;
          currentScore = r.percentage;
        }
      });

      // Re-sort by roll number for default display
      rankedResults.sort((a, b) => {
        const rollA = a.student.rollNumber ? String(a.student.rollNumber).padStart(10, '0') : 'Z';
        const rollB = b.student.rollNumber ? String(b.student.rollNumber).padStart(10, '0') : 'Z';
        return rollA.localeCompare(rollB);
      });

      // Calculate stats
      const validResults = rankedResults.filter(r => r.hasMarks);
      let classAverage = 0, highestScore = 0, lowestScore = 0, passRate = 0;
      if (validResults.length > 0) {
        classAverage = validResults.reduce((acc, r) => acc + r.percentage, 0) / validResults.length;
        highestScore = Math.max(...validResults.map(r => r.percentage));
        lowestScore = Math.min(...validResults.map(r => r.percentage));
        const passed = validResults.filter(r => r.percentage >= 50).length;
        passRate = (passed / validResults.length) * 100;
      }

      setClassData({
        subjects: subjectsList,
        results: rankedResults,
        stats: { classAverage, highestScore, lowestScore, passRate }
      });

    } catch (e) {
      setError(e.message || 'Failed to load class results.');
    } finally {
      setLoadingClass(false);
    }
  };

  const handleBack = () => {
    setSelectedClass(null);
    setClassData(null);
  };

  const getRankClass = (rank) => {
    if (rank === 1) return 'rank-1';
    if (rank === 2) return 'rank-2';
    if (rank === 3) return 'rank-3';
    return '';
  };
  
  const getRankIcon = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  };

  const highlightText = (text, highlight) => {
    if (!highlight.trim()) {
      return <span>{text}</span>;
    }
    const regex = new RegExp(`(${highlight})`, 'gi');
    const parts = String(text).split(regex);
    return (
      <span>
        {parts.map((part, i) => 
          regex.test(part) ? <span key={i} className="highlight">{part}</span> : <span key={i}>{part}</span>
        )}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="public-portal">
        <header className="portal-header">
          <img src={schoolLogo} alt="Matha English Medium School" className="portal-logo" />
          <h1 className="school-name-title">Matha English Medium School</h1>
          <div className="gold-divider" />
          <p className="portal-subtitle">EXAM RESULTS PORTAL</p>
        </header>
        <div className="main-content" style={{ marginTop: 40 }}>
          <div className="class-grid">
            {[1,2,3,4].map(i => (
              <div key={i} className="class-card skeleton-box" style={{ height: 120, animationDelay: `${i*100}ms` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: '#dc2626', fontSize: '1.2rem' }}>⚠ {error}</p>
    </div>
  );

  if (!publishedExam) {
    return (
      <div className="not-published">
        <img src={schoolLogo} alt="Matha English Medium School" className="portal-logo" style={{ width: 120, height: 120, animation: 'none' }} />
        <div className="not-published-icon">📋</div>
        <h1>Results Not Yet Published</h1>
        <p>Please check back later or contact the school.</p>
        <div style={{ padding: 24, background: 'white', borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center', marginTop: 32 }}>
          <h3 style={{ margin: '0 0 12px 0', color: 'var(--primary-blue)' }}>Matha English Medium School</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>Kaikalur, Andhra Pradesh</p>
          <p style={{ margin: '8px 0 0 0', color: 'var(--text-muted)' }}>Phone: +91 99999 99999</p>
        </div>
      </div>
    );
  }

  const filteredResults = classData?.results.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = r.student.name.toLowerCase().includes(term);
    const rollMatch = r.student.rollNumber && String(r.student.rollNumber).toLowerCase().includes(term);
    return nameMatch || rollMatch;
  });

  return (
    <div className="public-portal" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      
      {/* Print Header Logo */}
      <div className="print-header-logo">
        <img src={schoolLogo} alt="Matha English Medium School" />
        <h2>Matha English Medium School</h2>
        <h3>{publishedExam.name} Results</h3>
        {selectedClass && <h4>Class: {selectedClass.name}</h4>}
      </div>

      <header className="portal-header">
        <img src={schoolLogo} alt="Matha English Medium School" className="portal-logo" />
        <h1 className="school-name-title">Matha English Medium School</h1>
        <p className="portal-subtitle">EXAM RESULTS PORTAL</p>
        <div className="gold-divider" />
        <div className="academic-year">Academic Year 2026-27</div>
      </header>

      <main className="main-content">
        <div style={{ position: 'relative', minHeight: '60vh' }}>
          
          {/* Class Selection View */}
          <div className={`view-container ${selectedClass ? 'view-exit-left' : 'view-enter-active'}`}>
            <div style={{ background: 'white', padding: 24, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 32 }}>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', color: 'var(--text-dark)' }}>{publishedExam.name}</h2>
              <div style={{ color: 'var(--text-muted)' }}>
                Published on: {new Date(publishedExam.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--primary-blue)', marginBottom: 24, fontWeight: 700 }}>Select a Class</h2>
            <div className="class-grid">
              {classes.map((cls, index) => (
                <div 
                  key={cls.id} 
                  className="class-card" 
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => handleSelectClass(cls)}
                >
                  <div className="class-card-header">
                    <h3 className="class-card-title">{cls.name}</h3>
                    <div className="class-card-icon">📚</div>
                  </div>
                  <div className="class-card-action">
                    View Marksheet <span className="arrow-icon">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Results View */}
          <div className={`view-container ${!selectedClass ? 'view-exit-right' : 'view-enter-active'}`}>
            {selectedClass && (
              <>
                <div className="results-header">
                  <button className="back-btn" onClick={handleBack}>
                    ← Back to Classes
                  </button>
                  <h2 style={{ fontSize: '1.8rem', color: 'var(--text-dark)', margin: 0 }}>
                    {selectedClass.name} Results
                  </h2>
                  <button className="print-btn" onClick={() => window.print()}>
                    🖨️ Print Results
                  </button>
                </div>

                {loadingClass ? (
                  <div className="table-container">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="skeleton-row">
                        <div className="skeleton-box" style={{ width: '10%' }} />
                        <div className="skeleton-box" style={{ width: '30%' }} />
                        <div className="skeleton-box" style={{ width: '15%' }} />
                        <div className="skeleton-box" style={{ width: '15%' }} />
                        <div className="skeleton-box" style={{ width: '15%' }} />
                        <div className="skeleton-box" style={{ width: '15%' }} />
                      </div>
                    ))}
                  </div>
                ) : classData ? (
                  <>
                    <div className="stats-grid">
                      <div className="stat-card" style={{ animationDelay: '100ms' }}>
                        <div className="stat-value"><CountUp end={classData.stats.classAverage} decimals={1} suffix="%" /></div>
                        <div className="stat-label">Class Avg</div>
                      </div>
                      <div className="stat-card" style={{ animationDelay: '200ms' }}>
                        <div className="stat-value"><CountUp end={classData.stats.highestScore} decimals={1} suffix="%" /></div>
                        <div className="stat-label">Highest</div>
                      </div>
                      <div className="stat-card" style={{ animationDelay: '300ms' }}>
                        <div className="stat-value"><CountUp end={classData.stats.lowestScore} decimals={1} suffix="%" /></div>
                        <div className="stat-label">Lowest</div>
                      </div>
                      <div className="stat-card" style={{ animationDelay: '400ms' }}>
                        <div className="stat-value"><CountUp end={classData.stats.passRate} decimals={1} suffix="%" /></div>
                        <div className="stat-label">Pass Rate</div>
                      </div>
                    </div>

                    <div className="search-box" style={{ marginBottom: 24 }}>
                      <span className="search-icon">🔍</span>
                      <input 
                        type="text" 
                        className="search-input" 
                        placeholder="Search student name or roll number..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>

                    <div className="table-container">
                      <table className="results-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Roll No</th>
                            <th>Student Name</th>
                            {classData.subjects.map(sub => (
                              <th key={sub.id}>
                                <div>{sub.name}</div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>Max: {sub.maxMarks}</div>
                              </th>
                            ))}
                            <th>Total</th>
                            <th>%</th>
                            <th>Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredResults.map((row, idx) => (
                            <tr key={row.student.id} className={`student-row ${getRankClass(row.rank)}`} style={{ animationDelay: `${idx * 30}ms` }}>
                              <td style={{ fontWeight: 600 }}>
                                <span className="rank-icon">{getRankIcon(row.rank)}</span>
                                {row.rank || '-'}
                              </td>
                              <td>{highlightText(row.student.rollNumber || '-', searchTerm)}</td>
                              <td>{highlightText(row.student.name, searchTerm)}</td>
                              
                              {classData.subjects.map(sub => {
                                const val = row.subjects[sub.id];
                                const isFail = val !== null && val < (sub.maxMarks * 0.4);
                                return (
                                  <td key={sub.id} style={{ color: isFail ? '#dc2626' : 'inherit', fontWeight: isFail ? 600 : 400 }}>
                                    {val !== null ? val : '—'}
                                  </td>
                                );
                              })}
                              
                              <td style={{ fontWeight: 600 }}>{row.totalMarks} / {row.totalMaxMarks}</td>
                              <td style={{ fontWeight: 700, color: row.percentage >= 80 ? '#059669' : row.percentage < 40 ? '#dc2626' : '#1e3a8a' }}>
                                {row.hasMarks ? <CountUp end={row.percentage} decimals={2} suffix="%" duration={1500} /> : '—'}
                              </td>
                              <td>
                                <span className={`badge-grade ${['A+', 'A', 'B'].includes(row.grade) ? 'badge-green' : ['C', 'D'].includes(row.grade) ? 'badge-blue' : row.grade === 'F' ? 'badge-red' : 'badge-gray'}`} style={{ animationDelay: `${(idx * 30) + 500}ms` }}>
                                  {row.grade || '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {filteredResults.length === 0 && (
                            <tr>
                              <td colSpan={classData.subjects.length + 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                                No students found matching your search.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="portal-footer">
        <p style={{ margin: 0, fontSize: '0.95rem' }}>© {new Date().getFullYear()} Matha English Medium School, Kaikalur</p>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', opacity: 0.8 }}>Powered by Matha Exam Manager</p>
      </footer>
    </div>
  );
}
