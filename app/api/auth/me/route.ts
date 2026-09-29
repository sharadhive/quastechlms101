import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, unauthorized } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';
import { getPermissions } from '@/lib/auth/permissions';

/** Who am I? Used by the panels to show/hide actions (the server still enforces everything). */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, branchId: true, isActive: true, mustChangePassword: true },
  });
  if (!user || !user.isActive) throw unauthorized();
  const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'BRANCH_ADMIN'].includes(user.role);
  const perms = user.role === 'INSTRUCTOR' ? await getPermissions(user.id) : {};
  return NextResponse.json({
    user,
    permissions: {
      manage_content: isAdmin || perms.manage_content === true,
      create_sessions: isAdmin || perms.create_sessions === true,
      announce: isAdmin || perms.announce === true,
      view_contacts: isAdmin || perms.view_contacts === true,
      attendance_override: isAdmin || perms.attendance_override === true,
      publish_recordings: isAdmin || perms.publish_recordings === true,
    },
  });
});
