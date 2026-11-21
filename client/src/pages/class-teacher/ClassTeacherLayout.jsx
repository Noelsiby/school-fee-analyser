import AppShell from '../../components/shell/AppShell';

const SECTIONS = [
  {
    items: [
      { path: '/class-teacher/dashboard',  label: 'Dashboard',  icon: '📊' },
      { path: '/class-teacher/attendance', label: 'Attendance', icon: '✅' },
      { path: '/class-teacher/analyser',   label: 'Class analyser', icon: '📈' },
    ],
  },
];

export default function ClassTeacherLayout() {
  return (
    <AppShell role="ClassTeacher" roleLabel="Class Teacher" sections={SECTIONS}
      theme={{ sidebar: '#064e3b', accent: '#a7f3d0', avatar: '#059669' }} />
  );
}
