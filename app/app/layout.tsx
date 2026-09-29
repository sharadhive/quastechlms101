import Shell, { NavGroup } from '@/components/Shell';

const groups: NavGroup[] = [
  { items: [{ href: '/app', label: 'Home', icon: 'home' }] },
  { title: 'Learning', items: [
    { href: '/app/courses', label: 'My Courses', icon: 'book' },
    { href: '/app/recordings', label: 'Class Recordings', icon: 'video' },
    { href: '/app/calendar', label: 'Class Calendar', icon: 'cal' },
    { href: '/app/explore', label: 'Explore Courses', icon: 'search' },
  ]},
  { title: 'Progress', items: [
    { href: '/app/results', label: 'Exams & Results', icon: 'clip' },
    { href: '/app/certificates', label: 'Certificates', icon: 'cert' },
    { href: '/app/leaderboard', label: 'Leaderboard', icon: 'chart' },
    { href: '/app/notifications', label: 'Notifications', icon: 'bell' },
  ]},
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <Shell title="Student Panel" groups={groups}>{children}</Shell>;
}
