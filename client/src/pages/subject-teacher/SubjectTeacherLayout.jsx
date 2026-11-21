import AppShell from '../../components/shell/AppShell';

const SECTIONS = [
  {
    items: [
      { path: '/subject-teacher/dashboard',  label: 'Dashboard',  icon: '📊' },
      { path: '/subject-teacher/attendance', label: 'Attendance', icon: '✅' },
      { path: '/subject-teacher/analyser',   label: 'Analyser',   icon: '📈' },
    ],
  },
];

export default function SubjectTeacherLayout() {
  return (
    <AppShell role="SubjectTeacher" roleLabel="Subject Teacher" sections={SECTIONS}
      theme={{ sidebar: '#1e1b4b', accent: '#c7d2fe', avatar: '#4338ca' }} />
  );
}
