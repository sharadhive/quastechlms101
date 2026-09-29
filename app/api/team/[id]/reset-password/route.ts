import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { requireRole, tenantScope } from '@/lib/auth/rbac';
import { revokeAllForUser } from '@/lib/auth/tokens';
import { enqueue } from '@/lib/jobs/queue';
import { generateTempPassword, stripTempPassword } from '@/lib/auth/passwords';

/** POST /api/team/[id]/reset-password — new temporary password (shown once + emailed, never stored). */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN', 'ADMIN']);
  const scope = tenantScope(session);

  const user = await prisma.user.findFirst({
    where: {
      id: ctx.params.id,
      organizationId: scope.organizationId,
      role: { in: ['ADMIN', 'BRANCH_ADMIN', 'INSTRUCTOR'] },
    },
  });
  if (!user) throw notFound('Team member not found');
  // An Admin may reset instructors only — admin accounts are managed by the Super Admin
  if (user.role !== 'INSTRUCTOR' && session.role !== 'SUPER_ADMIN')
    throw forbidden('Only the Super Admin can reset an admin password');

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      profile: stripTempPassword(user.profile),
    },
  });
  await revokeAllForUser(user.id);
  await enqueue('EMAIL_WELCOME', { to: user.email, name: user.name, email: user.email, tempPassword, reset: true });

  return NextResponse.json({ tempPassword, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
});
