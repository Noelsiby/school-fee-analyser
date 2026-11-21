import AppShell from '../../components/shell/AppShell';

// The head of tuition's menu. The admin never sees these pages.
const SECTIONS = [
  {
    items: [
      { path: '/tuition/dashboard', label: 'Dashboard', icon: '📊' },
      { path: '/tuition/students',  label: 'Students', icon: '👦' },
      { path: '/tuition/fees',      label: 'Fees', icon: '💰' },
      { path: '/tuition/messages',  label: 'Messages to parents', icon: '📢' },
    ],
  },
  {
    title: 'Setup',
    items: [
      { path: '/tuition/classes',  label: 'Tuition classes', icon: '🏫' },
      { path: '/tuition/teachers', label: 'Teachers', icon: '👩‍🏫' },
    ],
  },
];

export default function TuitionLayout() {
  return (
    <AppShell role="TuitionHead" roleLabel="Tuition" sections={SECTIONS}
      theme={{ sidebar: '#431407', accent: '#fdba74', avatar: '#c2410c' }} />
  );
}
