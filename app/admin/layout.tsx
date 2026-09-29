import Shell, { NavGroup } from '@/components/Shell';

const groups: NavGroup[] = [
  { items: [{ href: '/admin', label: 'Dashboard', icon: 'home' }] },
  { title: 'Learning', items: [
    { href: '/admin/courses', label: 'Courses', icon: 'book' },
    { href: '/admin/batches', label: 'Batches & Classes', icon: 'layers' },
    { href: '/admin/recordings', label: 'Class Recordings', icon: 'video' },
  ]},
  { title: 'People', items: [
    { href: '/admin/enroll', label: 'New Enrolment', icon: 'plus' },
    { href: '/admin/learners', label: 'Learners', icon: 'users' },
    { href: '/admin/enquiries', label: 'Enquiries', icon: 'bell' },
    { href: '/admin/team', label: 'Team & Instructors', icon: 'shield' },
  ]},
  { title: 'Finance', items: [
    { href: '/admin/fees', label: 'Fees', icon: 'cash' },
  ]},
  { title: 'Marketing', items: [
    { href: '/admin/announcements', label: 'Announcements', icon: 'bell' },
    { href: '/admin/campaigns', label: 'Campaigns', icon: 'send' },
    { href: '/admin/banners', label: 'Banners', icon: 'flag' },
  ]},
  { title: 'Organisation', items: [
    { href: '/admin/branches', label: 'Branches', icon: 'pin' },
    { href: '/admin/analytics', label: 'Analytics', icon: 'chart' },
  ]},
  { title: 'Super Admin', superAdminOnly: true, items: [
    { href: '/admin/integrations', label: 'Integrations', icon: 'plug' },
  ]},
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Shell title="Admin Panel" groups={groups}>{children}</Shell>;
}
