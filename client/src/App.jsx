import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, getRolePath } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

import LoginPage              from './pages/LoginPage';
import RoleSwitcherPage       from './pages/RoleSwitcherPage';

// Admin module
import AdminLayout            from './pages/admin/AdminLayout';
import DashboardHome          from './pages/admin/DashboardHome';
import ClassesPage            from './pages/admin/ClassesPage';
import ClassDetailPage        from './pages/admin/ClassDetailPage';
import TeachersPage           from './pages/admin/TeachersPage';
import StudentsPage           from './pages/admin/StudentsPage';
import ExamsPage              from './pages/admin/ExamsPage';
import ExamResultsPage        from './pages/admin/ExamResultsPage';

// Class Teacher module
import ClassTeacherLayout     from './pages/class-teacher/ClassTeacherLayout';
import ClassTeacherDashboard  from './pages/class-teacher/ClassTeacherDashboard';
import ExamReviewPage         from './pages/class-teacher/ExamReviewPage';
import SubjectTeacherLayout   from './pages/subject-teacher/SubjectTeacherLayout';
import SubjectTeacherDashboard from './pages/subject-teacher/SubjectTeacherDashboard';
import MarksEntryPage         from './pages/subject-teacher/MarksEntryPage';

// Root redirect: if logged in → go to active role's dashboard; else → /login
function RootRedirect() {
  const { isAuthenticated, activeRole } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (activeRole)        return <Navigate to={getRolePath(activeRole)} replace />;
  return <Navigate to="/role-select" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />

      {/* ── Role Selector ──────────────────────────────────── */}
      <Route
        path="/role-select"
        element={
          <ProtectedRoute>
            <RoleSwitcherPage />
          </ProtectedRoute>
        }
      />

      {/* ── Admin module (nested routes) ───────────────────── */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['Admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"    element={<DashboardHome />} />
        <Route path="classes"      element={<ClassesPage />} />
        <Route path="classes/:id"  element={<ClassDetailPage />} />
        <Route path="teachers"     element={<TeachersPage />} />
        <Route path="students"     element={<StudentsPage />} />
        <Route path="exams"        element={<ExamsPage />} />
        <Route path="exams/:id/results" element={<ExamResultsPage />} />
      </Route>

      {/* ── Class Teacher ───────────────────────────────────── */}
      <Route
        path="/class-teacher"
        element={
          <ProtectedRoute allowedRoles={['ClassTeacher']}>
            <ClassTeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<ClassTeacherDashboard />} />
        <Route path="exams/:id/review" element={<ExamReviewPage />} />
      </Route>

      {/* ── Subject Teacher ─────────────────────────────────── */}
      <Route
        path="/subject-teacher"
        element={
          <ProtectedRoute allowedRoles={['SubjectTeacher']}>
            <SubjectTeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<SubjectTeacherDashboard />} />
        <Route path="exams/:examId/subjects/:subjectId/marks" element={<MarksEntryPage />} />
      </Route>

      {/* ── Root + catch-all ────────────────────────────────────── */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', gap:16 }}>
          <p style={{ fontSize:'4rem' }}>404</p>
          <p style={{ fontSize:'1.25rem', color:'#64748b' }}>Page not found</p>
          <button style={{ padding:'10px 24px', background:'#1e3a8a', color:'white', border:'none', borderRadius:8, cursor:'pointer' }} onClick={() => window.history.back()}>Go Back</button>
        </div>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
