import { prisma } from '@/lib/prisma';

/** Extra capabilities an Admin/Super Admin can grant to an instructor. */
export const INSTRUCTOR_PERMISSIONS = [
  { key: 'manage_content',      label: 'Manage course content',        help: 'Add or edit materials in the courses they teach' },
  { key: 'create_sessions',     label: 'Schedule their own classes',   help: 'Create class sessions without asking an admin' },
  { key: 'announce',            label: 'Post announcements',           help: 'Send announcements to their own batches' },
  { key: 'view_contacts',       label: 'See learner contact details',  help: 'View phone numbers and emails of their students' },
  { key: 'attendance_override', label: 'Edit attendance after 48h',    help: 'Bypass the attendance edit lock' },
  { key: 'publish_recordings',  label: 'Publish recordings directly',  help: 'Recordings go live without admin approval' },
] as const;

export type PermissionKey = (typeof INSTRUCTOR_PERMISSIONS)[number]['key'];

/** Admins always pass. Instructors pass only when the permission was granted. */
export async function can(
  session: { userId: string; role: string },
  permission: PermissionKey,
): Promise<boolean> {
  if (['SUPER_ADMIN', 'ADMIN', 'BRANCH_ADMIN'].includes(session.role)) return true;
  if (session.role !== 'INSTRUCTOR') return false;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { permissions: true },
  });
  const perms = (user?.permissions ?? {}) as Record<string, boolean>;
  return perms[permission] === true;
}

export async function getPermissions(userId: string): Promise<Record<string, boolean>> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { permissions: true } });
  return (u?.permissions ?? {}) as Record<string, boolean>;
}
