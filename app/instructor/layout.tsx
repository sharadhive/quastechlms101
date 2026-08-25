import Shell, { NavGroup } from '@/components/Shell';

const groups: NavGroup[] = [
  { items: [{ href: '/instructor', label: 'Dashboard', icon: 'home' }] },
  { title: 'Teaching', items: [
    { href: '/instructor/batches', label: 'My Batches', icon: 'layers' },
    { href: '/instructor/evaluations', label: 'Evaluation Queue', icon: 'clip' },
    { href: '/instructor/qna', label: 'Q&A Queue', icon: 'bell' },
    { href: '/instructor/notes', label: 'Student Notes', icon: 'book' },
    { href: '/instructor/recordings', label: 'My Recordings', icon: 'video' },
  ]},
];

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return <Shell title="Instructor Panel" groups={groups}>{children}</Shell>;
}
