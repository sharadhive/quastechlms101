import { NextResponse, type NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { revokeAllForUser } from '@/lib/auth/tokens';
import { enqueue } from '@/lib/jobs/queue';
import { generateTempPassword, stripTempPassword } from '@/lib/auth/passwords';

/** POST /api/learners/[id]/reset-password — new temporary password (shown once + emailed, never stored). */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);

  const user = await prisma.user.findFirst({
    where: { id: ctx.params.id, role: 'STUDENT', ...scope },
  });
  if (!user) throw notFound('Learner not found');

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
