import Shell, { NavGroup } from '@/components/Shell';
import ClassRecorderProvider from '@/components/ClassRecorder';

const groups: NavGroup[] = [
  { items: [{ href: '/instructor', label: 'Dashboard', icon: 'home' }] },
  { title: 'Teaching', items: [
    { href: '/instructor/batches', label: 'My Batches', icon: 'layers' },
    { href: '/instructor/courses', label: 'My Courses', icon: 'book' },
    { href: '/instructor/recordings', label: 'Class Recordings', icon: 'video' },
  ]},
  { title: 'Students', items: [
    { href: '/instructor/evaluations', label: 'Evaluation Queue', icon: 'clip' },
    { href: '/instructor/qna', label: 'Q&A Queue', icon: 'bell' },
    { href: '/instructor/notes', label: 'Student Notes', icon: 'edit' },
  ]},
];

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <Shell title="Instructor Panel" groups={groups}>
      {/* the class recorder lives here so it keeps recording while you move between pages */}
      <ClassRecorderProvider>{children}</ClassRecorderProvider>
    </Shell>
  );
}
