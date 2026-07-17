import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../../hooks/useApi';
import schoolLogo from '../../assets/school-logo.png';

export default function PublicResults() {
  const { apiCall } = useApi();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [publishedExam, setPublishedExam] = useState(null);
  const [classesData, setClassesData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const loadAllData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // 1. Fetch published exam & class list
      const res = await apiCall('/api/public/classes');
      if (!res.publishedExam) {
        setPublishedExam(null);
        setLoading(false);
        return;
      }
      
      setPublishedExam(res.publishedExam);
      const classList = res.classes;
      
      // 2. Fetch results for ALL classes concurrently
      const classPromises = classList.map(async (cls) => {
        const cRes = await apiCall(`/api/public/classes/${cls.id}/results`);
        return processClassData(cRes);
      });
      
      const allClassData = await Promise.all(classPromises);
      setClassesData(allClassData);
      
    } catch (e) {
      setError(e.message || 'Failed to load public results.');
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { loadAllData(); }, [loadAllData]);

  // Helper to process class data (calculate totals, ranks, stats)
  const processClassData = (res) => {
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

    // PROBLEM 1 FIX: Use m.marksObtained instead of m.marks
    marks.forEach(m => {
      if (studentsMap[m.studentId] && m.marksObtained !== null) {
        studentsMap[m.studentId].subjects[m.subjectId] = m.marksObtained;
        studentsMap[m.studentId].totalMarks += m.marksObtained;
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

    // Sort by percentage for rank
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

    // Re-sort by percentage by default (highest first), as requested: "Sorted by highest percentage first"
    rankedResults.sort((a, b) => {
      if (a.hasMarks && b.hasMarks) return b.percentage - a.percentage;
      if (a.hasMarks) return -1;
      if (b.hasMarks) return 1;
      const rollA = a.student.rollNumber ? String(a.student.rollNumber).padStart(10, '0') : 'Z';
      const rollB = b.student.rollNumber ? String(b.student.rollNumber).padStart(10, '0') : 'Z';
      return rollA.localeCompare(rollB);
    });

    // Calculate stats
    const validResults = rankedResults.filter(r => r.hasMarks);
    let classAverage = 0, highestScore = 0, lowestScore = 0, passRate = 0;
    let highestStudent = '-', lowestStudent = '-';
    
    if (validResults.length > 0) {
      classAverage = validResults.reduce((acc, r) => acc + r.percentage, 0) / validResults.length;
      highestScore = Math.max(...validResults.map(r => r.percentage));
      lowestScore = Math.min(...validResults.map(r => r.percentage));
      const passed = validResults.filter(r => r.percentage >= 50).length;
      passRate = (passed / validResults.length) * 100;
      
      const highestRows = validResults.filter(r => r.percentage === highestScore);
      highestStudent = highestRows.map(r => r.student.name).join(', ');
      
      const lowestRows = validResults.filter(r => r.percentage === lowestScore);
      lowestStudent = lowestRows.map(r => r.student.name).join(', ');
    }

    return {
      classInfo,
      subjects: subjectsList,
      results: rankedResults,
      stats: { classAverage, highestScore, lowestScore, passRate, highestStudent, lowestStudent }
    };
  };

  const highlightText = (text, highlight) => {
    if (!highlight.trim() || !text) return <span>{text || '—'}</span>;
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

  // Rendering Loading
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
          <div className="table-container" style={{ padding: 24 }}>
            <h2 style={{ color: 'var(--text-muted)' }}>Loading Results...</h2>
          </div>
        </div>
      </div>
    );
  }

  // Rendering Error
  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: '#dc2626', fontSize: '1.2rem' }}>⚠ {error}</p>
    </div>
  );

  // Rendering Not Published
  if (!publishedExam) {
    return (
      <div className="not-published">
        <Styles />
        <img src={schoolLogo} alt="Matha English Medium School" className="portal-logo" style={{ width: 100, height: 100, animation: 'fadeScaleIn 600ms ease-out forwards' }} />
        <div className="not-published-icon">📋</div>
        <h1>Results Not Yet Published</h1>
        <p>Please check back later or contact the school.</p>
        <div className="not-published-card">
          <h3>Matha English Medium School</h3>
          <p>Kaikalur, Andhra Pradesh</p>
          <p style={{ marginTop: 8 }}>Phone: +91 99999 99999</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-portal">
      <Styles />
      
      {/* Print Header */}
      <div className="print-header-logo">
        <img src={schoolLogo} alt="Matha English Medium School" />
        <h2>Matha English Medium School</h2>
        <h3>{publishedExam.name} Results</h3>
      </div>

      {/* Branded Header */}
      <header className="portal-header">
        <img src={schoolLogo} alt="Matha English Medium School" className="portal-logo" />
        <h1 className="school-name-title">Matha English Medium School</h1>
        <p className="portal-subtitle">EXAM RESULTS PORTAL</p>
        <div className="gold-divider" />
        <div className="academic-year">Academic Year 2026-27</div>
      </header>

      <main className="main-content">
        <div className="exam-banner">
          <h2>Results for: {publishedExam.name}</h2>
          <div className="exam-banner-sub">
            Published on: {new Date(publishedExam.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
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

        <div className="classes-list">
          {classesData.map((clsData, clsIdx) => {
            const filteredResults = clsData.results.filter(r => {
              if (!searchTerm) return true;
              const term = searchTerm.toLowerCase();
              const nameMatch = r.student.name.toLowerCase().includes(term);
              const rollMatch = r.student.rollNumber && String(r.student.rollNumber).toLowerCase().includes(term);
              return nameMatch || rollMatch;
            });

            if (searchTerm && filteredResults.length === 0) return null;

            return (
              <section key={clsData.classInfo.id} className="class-section" style={{ animationDelay: `${clsIdx * 100}ms` }}>
                
                {/* Class Header (Admin Style) */}
                <div className="class-section-header">
                  <div className="class-section-title">
                    {clsData.classInfo.name} — {clsData.classInfo.students.length} Students
                  </div>
                  <div className="class-section-badge">
                    ✅ Published
                  </div>
                </div>

                {/* Class Stats */}
                {!searchTerm && (
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{clsData.stats.classAverage.toFixed(1)}%</div>
                      <div className="stat-label">Class Average</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{clsData.stats.highestScore.toFixed(1)}%</div>
                      <div className="stat-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Highest ({clsData.stats.highestStudent})
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{clsData.stats.lowestScore.toFixed(1)}%</div>
                      <div className="stat-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Lowest ({clsData.stats.lowestStudent})
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{clsData.stats.passRate.toFixed(1)}%</div>
                      <div className="stat-label">Pass Rate</div>
                    </div>
                  </div>
                )}

                {/* Results Table */}
                <div className="table-container">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th style={{ width: 80 }}>RANK</th>
                        <th style={{ width: 100 }}>ROLL NO</th>
                        <th style={{ width: 250 }}>STUDENT NAME</th>
                        {clsData.subjects.map(sub => (
                          <th key={sub.id}>
                            <div>{sub.name}</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.9 }}>(Max: {sub.maxMarks})</div>
                          </th>
                        ))}
                        <th>TOTAL</th>
                        <th>PERCENTAGE</th>
                        <th>GRADE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((row, idx) => (
                        <tr key={row.student.id} className={`student-row ${getRankClass(row.rank)}`}>
                          <td style={{ fontWeight: 600 }}>
                            <span className="rank-icon">{getRankIcon(row.rank)}</span>
                            {row.rank || '-'}
                          </td>
                          <td>{highlightText(row.student.rollNumber, searchTerm)}</td>
                          <td style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{highlightText(row.student.name, searchTerm)}</td>
                          
                          {clsData.subjects.map(sub => {
                            const val = row.subjects[sub.id];
                            const isFail = val !== null && val < (sub.maxMarks * 0.4);
                            return (
                              <td key={sub.id} style={{ color: isFail ? '#dc2626' : 'inherit', fontWeight: isFail ? 600 : 400 }}>
                                {val !== null ? val : '—'}
                              </td>
                            );
                          })}
                          
                          <td style={{ fontWeight: 700 }}>
                            {row.hasMarks ? `${row.totalMarks} / ${row.totalMaxMarks}` : '—'}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--primary-blue)' }}>
                            {row.hasMarks ? `${row.percentage.toFixed(2)}%` : '—'}
                          </td>
                          <td>
                            <span className={`badge-grade ${['A+', 'A', 'B'].includes(row.grade) ? 'badge-green' : ['C', 'D'].includes(row.grade) ? 'badge-blue' : row.grade === 'F' ? 'badge-red' : 'badge-gray'}`}>
                              {row.grade || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredResults.length === 0 && (
                        <tr>
                          <td colSpan={clsData.subjects.length + 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                            No students found matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

              </section>
            );
          })}
        </div>
      </main>

      <footer className="portal-footer">
        <p style={{ margin: 0, fontSize: '0.95rem' }}>© {new Date().getFullYear()} Matha English Medium School, Kaikalur</p>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', opacity: 0.8 }}>Powered by Matha Exam Manager</p>
      </footer>
    </div>
  );
}

// Inline styles embedded strictly as requested
const Styles = () => (
  <style>{`
    :root {
      --primary-blue: #1E3A8A;
      --accent-gold: #F5B700;
      --success-green: #16A34A;
      --bg-color: #F9FAFB;
      --text-dark: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }

    * { box-sizing: border-box; }

    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; }
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

    @keyframes float {
      0% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
      100% { transform: translateY(0); }
    }

    /* Base Styles */
    .public-portal {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: var(--bg-color);
      font-family: 'Inter', sans-serif;
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

    .school-name-title {
      color: var(--primary-blue);
      font-size: 2.2rem;
      font-weight: 800;
      margin: 0 0 8px 0;
      opacity: 0;
      animation: slideDownIn 500ms ease-out forwards;
    }

    .portal-subtitle {
      color: var(--accent-gold);
      letter-spacing: 3px;
      font-weight: 700;
      font-size: 1.1rem;
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
      max-width: 1400px;
      margin: 0 auto;
      width: 100%;
    }

    /* Exam Banner */
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
    .exam-banner h2 {
      margin: 0 0 8px 0;
      font-size: 2rem;
      font-weight: 700;
    }
    .exam-banner-sub {
      opacity: 0.9;
      font-size: 1.1rem;
    }

    /* Search Box */
    .search-box {
      position: relative;
      width: 100%;
      max-width: 600px;
      margin: 0 auto 32px auto;
      animation: slideUpFade 500ms ease-out forwards;
    }
    .search-input {
      width: 100%;
      padding: 14px 16px 14px 44px;
      border: 2px solid var(--border);
      border-radius: 8px;
      font-size: 1.1rem;
      transition: border-color 200ms, box-shadow 200ms;
    }
    .search-input:focus {
      outline: none;
      border-color: var(--primary-blue);
      box-shadow: 0 0 0 3px rgba(30, 58, 138, 0.1);
    }
    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 1.2rem;
    }

    /* Class Sections */
    .class-section {
      margin-bottom: 48px;
      opacity: 0;
      animation: slideUpFade 600ms ease-out forwards;
    }

    .class-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding: 0 8px;
    }
    .class-section-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-blue);
    }
    .class-section-badge {
      background: #dcfce7;
      color: var(--success-green);
      padding: 6px 12px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 6px;
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
      border: 1px solid var(--border);
      text-align: center;
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
      border: 1px solid var(--border);
      overflow-x: auto;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 900px;
    }

    .results-table th {
      background: var(--primary-blue);
      padding: 16px;
      text-align: center;
      font-weight: 600;
      color: white;
      white-space: nowrap;
      border: 1px solid #172b66;
    }

    .results-table th:nth-child(1), .results-table th:nth-child(2), .results-table th:nth-child(3) {
      text-align: left;
    }

    .results-table td {
      padding: 16px;
      text-align: center;
      border: 1px solid var(--border);
      background-color: white;
    }

    .results-table td:nth-child(1), .results-table td:nth-child(2), .results-table td:nth-child(3) {
      text-align: left;
    }

    /* Alternating row colors */
    .results-table tbody tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    /* Rank Highlighting overrides alternating colors */
    .results-table tbody tr.rank-1 td { background-color: #fef9c3; }
    .results-table tbody tr.rank-2 td { background-color: #f1f5f9; }
    .results-table tbody tr.rank-3 td { background-color: #ffedd5; }

    .highlight {
      background-color: yellow;
      color: black;
      padding: 0 2px;
      border-radius: 2px;
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
    }

    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-gray { background: #f1f5f9; color: #64748b; }
    .badge-red { background: #fee2e2; color: #dc2626; }

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
    
    .not-published-card {
      padding: 24px; 
      background: white; 
      border-radius: 12px; 
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); 
      text-align: center; 
      margin-top: 32px;
      animation: slideUpFade 500ms ease-out 200ms forwards;
      opacity: 0;
    }
    .not-published-card h3 { margin: 0 0 12px 0; color: var(--primary-blue); }
    .not-published-card p { margin: 0; color: var(--text-muted); }

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
      .portal-header, .portal-footer, .search-box, .stats-grid, .exam-banner {
        display: none !important;
      }
      .print-header-logo {
        display: block !important;
        text-align: center;
        margin-bottom: 20px;
      }
      .print-header-logo img { width: 100px; height: 100px; }
      .print-header-logo h2 { color: black; margin: 8px 0; }
      .main-content { padding: 0; max-width: none; }
      .table-container { box-shadow: none; border: none; }
      .results-table th { background: #eee !important; color: black !important; border-bottom: 2px solid black; }
      .results-table td { border-bottom: 1px solid #ccc; }
      .results-table tbody tr td { background-color: white !important; }
    }
    .print-header-logo { display: none; }
  `}</style>
);
