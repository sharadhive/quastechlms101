import Shell, { NavGroup } from '@/components/Shell';

const groups: NavGroup[] = [
  { items: [{ href: '/app', label: 'Home', icon: 'home' }] },
  { title: 'Learning', items: [
    { href: '/app/explore', label: 'Explore Courses', icon: 'search' },
    { href: '/app/courses', label: 'My Courses', icon: 'book' },
    { href: '/app/calendar', label: 'Calendar', icon: 'cal' },
    { href: '/app/results', label: 'Exams & Results', icon: 'clip' },
    { href: '/app/leaderboard', label: 'Leaderboard', icon: 'cert' },
    { href: '/app/certificates', label: 'Certificates', icon: 'cert' },
    { href: '/app/notifications', label: 'Notifications', icon: 'bell' },
  ]},
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <Shell title="Student Panel" groups={groups}>{children}</Shell>;
}
