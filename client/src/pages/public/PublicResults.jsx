import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';
import schoolLogo from '../../assets/school-logo.png';

// CountUp component for animating numbers
const CountUp = ({ end, duration = 1000, suffix = '', decimals = 0 }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
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
      
      rankedResults.forEach((r) => {
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
    if (!highlight.trim() || !text) {
      return <span>{text || '—'}</span>;
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
        <Styles />
        <header className="portal-header">
          <img src={schoolLogo} alt="Matha English Medium School" className="portal-logo" />
          <h1 className="school-name-title">Matha English Medium School</h1>
          <p className="portal-subtitle">EXAM RESULTS PORTAL</p>
          <div className="gold-divider" />
          <div className="academic-year">Academic Year 2026-27</div>
        </header>
        <div className="main-content">
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
        <Styles />
        <img src={schoolLogo} alt="Matha English Medium School" className="portal-logo" style={{ width: 100, height: 100, animation: 'fadeScaleIn 600ms ease-out forwards' }} />
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
      <Styles />
      
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
            <div className="exam-banner">
              <h2 style={{ margin: '0 0 4px 0', fontSize: '2rem' }}>Results for: {publishedExam.name}</h2>
              <div style={{ opacity: 0.9, fontSize: '1rem' }}>
                Published on: {new Date(publishedExam.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
            
            <div className="class-grid">
              {classes.map((cls, index) => (
                <div 
                  key={cls.id} 
                  className="class-card" 
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => handleSelectClass(cls)}
                >
                  <div className="class-card-header">
                    <div>
                      <h3 className="class-card-title">{cls.name}</h3>
                      <p className="class-card-subtitle">All Students</p>
                    </div>
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
                        <div className="stat-label">Class Average</div>
                      </div>
                      <div className="stat-card" style={{ animationDelay: '200ms' }}>
                        <div className="stat-value"><CountUp end={classData.stats.highestScore} decimals={1} suffix="%" /></div>
                        <div className="stat-label">Highest Score</div>
                      </div>
                      <div className="stat-card" style={{ animationDelay: '300ms' }}>
                        <div className="stat-value"><CountUp end={classData.stats.lowestScore} decimals={1} suffix="%" /></div>
                        <div className="stat-label">Lowest Score</div>
                      </div>
                      <div className="stat-card" style={{ animationDelay: '400ms' }}>
                        <div className="stat-value"><CountUp end={classData.stats.passRate} decimals={1} suffix="%" /></div>
                        <div className="stat-label">Pass Rate</div>
                      </div>
                    </div>

                    <div className="search-box">
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
                              <td>{highlightText(row.student.rollNumber, searchTerm)}</td>
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

// Inline styles exactly as requested
const Styles = () => (
  <style>{`
    :root {
      --primary-blue: #1E3A8A;
      --accent-gold: #F5B700;
      --success-green: #16A34A;
      --bg-color: #F9FAFB;
      --surface: #ffffff;
      --text-dark: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        animation: none !important;
        transition: none !important;
      }
    }

    /* Animations */
    @keyframes fadeScaleIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes slideDownIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUpFade {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes slideInRight {
      from { opacity: 0; transform: translateX(30px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes popIn {
      0% { transform: scale(0); opacity: 0; }
      80% { transform: scale(1.1); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }

    @keyframes pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(30, 58, 138, 0.4); }
      70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(30, 58, 138, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(30, 58, 138, 0); }
    }

    @keyframes float {
      0% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
      100% { transform: translateY(0); }
    }

    @keyframes skeletonLoad {
      0% { background-color: #e2e8f0; }
      50% { background-color: #cbd5e1; }
      100% { background-color: #e2e8f0; }
    }

    /* Base Styles */
    .public-portal {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: var(--bg-color);
      font-family: 'Inter', sans-serif;
      overflow-x: hidden;
    }

    .portal-header {
      text-align: center;
      padding: 40px 20px 20px;
      background: white;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      position: relative;
      z-index: 10;
    }

    .portal-logo {
      width: 100px;
      height: 100px;
      object-fit: contain;
      margin-bottom: 16px;
      animation: fadeScaleIn 600ms ease-out forwards;
    }

    @media (min-width: 768px) {
      .portal-logo {
        width: 120px;
        height: 120px;
      }
    }

    .school-name-title {
      color: var(--primary-blue);
      font-size: 1.8rem;
      font-weight: 700;
      margin: 0 0 8px 0;
      opacity: 0;
      animation: slideDownIn 500ms ease-out forwards;
    }

    @media (min-width: 768px) {
      .school-name-title { font-size: 2.2rem; }
    }

    .portal-subtitle {
      color: var(--accent-gold);
      letter-spacing: 3px;
      font-weight: 700;
      font-size: 1rem;
      margin: 0;
      opacity: 0;
      animation: fadeIn 500ms ease-out 300ms forwards;
    }

    .gold-divider {
      width: 60px;
      height: 2px;
      background-color: var(--accent-gold);
      margin: 16px auto;
      border-radius: 2px;
      opacity: 0;
      animation: fadeIn 500ms ease-out 400ms forwards;
    }

    .academic-year {
      color: var(--text-muted);
      font-size: 0.9rem;
      opacity: 0;
      animation: fadeIn 500ms ease-out 500ms forwards;
    }

    .main-content {
      flex: 1;
      padding: 32px 16px;
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
      position: relative;
      overflow-x: hidden;
    }

    .exam-banner {
      background: var(--primary-blue);
      color: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      margin-bottom: 32px;
      text-align: center;
      animation: slideUpFade 500ms ease-out forwards;
    }

    /* View Transitions */
    .view-container {
      transition: transform 300ms ease-in-out, opacity 300ms ease-in-out;
    }
    .view-exit-left { transform: translateX(-100%); opacity: 0; position: absolute; width: 100%; pointer-events: none; }
    .view-exit-right { transform: translateX(100%); opacity: 0; position: absolute; width: 100%; pointer-events: none; }
    .view-enter-active { transform: translateX(0); opacity: 1; position: relative; }

    /* Class Cards */
    .class-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }

    .class-card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      border-left: 4px solid var(--primary-blue);
      cursor: pointer;
      transition: all 200ms ease;
      opacity: 0;
      animation: slideUpFade 500ms ease-out forwards;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 140px;
    }

    .class-card:hover {
      transform: translateY(-8px);
      box-shadow: 0 12px 20px -8px rgba(0,0,0,0.15);
      border-left-color: var(--accent-gold);
    }

    .class-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }

    .class-card-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-dark);
      margin: 0 0 4px 0;
    }

    .class-card-subtitle {
      color: var(--text-muted);
      margin: 0;
      font-size: 0.95rem;
    }

    .class-card-action {
      color: var(--accent-gold);
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .arrow-icon {
      transition: transform 200ms ease;
    }

    .class-card:hover .arrow-icon {
      transform: translateX(6px);
    }

    /* Results View */
    .results-header {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 24px;
    }

    @media (min-width: 768px) {
      .results-header {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
      }
    }

    .back-btn {
      background: transparent;
      border: none;
      color: var(--primary-blue);
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      transition: color 200ms;
    }

    .back-btn:hover { color: var(--accent-gold); }

    .search-box {
      position: relative;
      width: 100%;
      margin-bottom: 24px;
    }

    .search-input {
      width: 100%;
      padding: 12px 16px 12px 40px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 200ms, box-shadow 200ms;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--primary-blue);
      box-shadow: 0 0 0 3px rgba(30, 58, 138, 0.1);
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
    }

    .print-btn {
      background: var(--primary-blue);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: pulse 2s infinite;
      transition: background 200ms, transform 200ms;
    }

    .print-btn:hover {
      animation: none;
      background: var(--accent-gold);
      color: var(--text-dark);
      transform: translateY(-2px);
    }

    /* Stats Cards */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (min-width: 768px) {
      .stats-grid { grid-template-columns: repeat(4, 1fr); }
    }

    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      text-align: center;
      animation: popIn 500ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      opacity: 0;
    }

    .stat-value {
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--primary-blue);
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 0.85rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* Results Table */
    .table-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.05);
      overflow-x: auto;
      opacity: 0;
      animation: fadeIn 400ms ease-out forwards;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 800px;
    }

    .results-table th {
      background: #f8fafc;
      padding: 16px;
      text-align: center;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 2px solid var(--border);
      white-space: nowrap;
    }

    .results-table th:nth-child(1), .results-table th:nth-child(2), .results-table th:nth-child(3) {
      text-align: left;
    }

    .results-table td {
      padding: 16px;
      text-align: center;
      border-bottom: 1px solid var(--border);
    }

    .results-table td:nth-child(1), .results-table td:nth-child(2), .results-table td:nth-child(3) {
      text-align: left;
      font-weight: 500;
    }

    .student-row {
      opacity: 0;
      animation: slideInRight 400ms ease-out forwards;
      transition: background-color 200ms;
    }

    .student-row:hover {
      background-color: #f1f5f9;
    }

    .highlight {
      background-color: yellow;
      color: black;
      padding: 0 2px;
      border-radius: 2px;
    }

    /* Rank Highlighting */
    .rank-1 {
      background: linear-gradient(90deg, rgba(245, 183, 0, 0.15) 0%, transparent 100%);
      border-left: 4px solid var(--accent-gold);
    }
    .rank-2 {
      background: linear-gradient(90deg, rgba(148, 163, 184, 0.15) 0%, transparent 100%);
      border-left: 4px solid #94a3b8;
    }
    .rank-3 {
      background: linear-gradient(90deg, rgba(180, 83, 9, 0.15) 0%, transparent 100%);
      border-left: 4px solid #b45309;
    }

    .rank-icon {
      margin-right: 8px;
      font-size: 1.2rem;
    }

    .badge-grade {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 16px;
      font-weight: 700;
      font-size: 0.9rem;
      animation: popIn 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      opacity: 0;
    }

    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-gray { background: #f1f5f9; color: #64748b; }
    .badge-red { background: #fee2e2; color: #dc2626; }

    /* Skeleton Loader */
    .skeleton-row {
      display: flex;
      gap: 16px;
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }

    .skeleton-box {
      height: 20px;
      border-radius: 4px;
      animation: skeletonLoad 1.5s infinite;
    }

    /* Not Published State */
    .not-published {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: var(--bg-color);
      text-align: center;
      padding: 20px;
    }

    .not-published-icon {
      font-size: 4rem;
      margin-bottom: 16px;
      animation: float 3s ease-in-out infinite;
    }

    .not-published h1 {
      color: var(--primary-blue);
      font-size: 2rem;
      margin: 0 0 16px;
      animation: slideUpFade 500ms ease-out forwards;
    }

    .not-published p {
      color: var(--text-muted);
      font-size: 1.1rem;
      animation: slideUpFade 500ms ease-out 100ms forwards;
      opacity: 0;
    }

    /* Footer */
    .portal-footer {
      background: var(--primary-blue);
      color: white;
      padding: 24px;
      text-align: center;
      margin-top: auto;
    }

    /* Print Styles */
    @media print {
      .portal-header, .portal-footer, .search-box, .print-btn, .back-btn, .stats-grid, .exam-banner {
        display: none !important;
      }
      .print-header-logo {
        display: block !important;
        text-align: center;
        margin-bottom: 20px;
      }
      .print-header-logo img {
        width: 100px;
        height: 100px;
      }
      .print-header-logo h2 {
        color: black;
        margin: 8px 0;
      }
      .main-content {
        padding: 0;
        max-width: none;
      }
      .table-container {
        box-shadow: none;
      }
      .results-table th {
        background: #eee !important;
        color: black !important;
        border-bottom: 2px solid black;
      }
      .results-table td {
        border-bottom: 1px solid #ccc;
      }
      .rank-1, .rank-2, .rank-3 {
        background: none;
        border: none;
      }
    }

    .print-header-logo {
      display: none;
    }
  `}</style>
);
