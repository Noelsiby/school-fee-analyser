import AppShell from '../../components/shell/AppShell';

// The admin menu, grouped so things are easy to find.
// AI Assistant (/admin/assistant) is built but switched off: add it back here and set ANTHROPIC_API_KEY to use it.
const SECTIONS = [
  { items: [{ path: '/admin/dashboard', label: 'Dashboard', icon: '📊' }] },
  {
    title: 'Every day',
    items: [
      { path: '/admin/attendance', label: 'Attendance', icon: '✅' },
      { path: '/admin/messages',   label: 'Messages to parents', icon: '📢' },
      { path: '/admin/timetable',  label: 'Timetable', icon: '🗓️' },
    ],
  },
  {
    title: 'Exams & results',
    items: [
      { path: '/admin/exams',         label: 'Exams', icon: '📝' },
      { path: '/admin/grading',       label: 'Grading', icon: '🏅' },
      { path: '/admin/at-risk',       label: 'At-risk students', icon: '⚠️' },
      { path: '/admin/quick-answers', label: 'Quick Answers', icon: '🔎' },
    ],
  },
  {
    title: 'School setup',
    items: [
      { path: '/admin/classes',  label: 'Classes', icon: '🏛️' },
      { path: '/admin/students', label: 'Students', icon: '👦' },
      { path: '/admin/teachers', label: 'Teachers', icon: '👩‍🏫' },
      { path: '/admin/subjects', label: 'Subjects', icon: '📚' },
    ],
  },
  {
    title: 'Parents & app',
    items: [
      { path: '/admin/student-app', label: 'Student App', icon: '📱' },
      { path: '/admin/photo-day',   label: 'Photo day', icon: '📷' },
    ],
  },
];

export default function AdminLayout() {
  return <AppShell role="Admin" roleLabel="Administrator" sections={SECTIONS} />;
}
