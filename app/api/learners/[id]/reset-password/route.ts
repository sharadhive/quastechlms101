import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

/** POST /api/learners/[id]/reset-password — generate a new temp password */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);

  const user = await prisma.user.findFirst({
    where: { id: ctx.params.id, role: 'STUDENT', organizationId: scope.organizationId },
  });
  if (!user) throw notFound('Learner not found');

  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const existingProfile = (user.profile as any) ?? {};

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
      profile: { ...existingProfile, tempPassword },
    },
  });

  return NextResponse.json({ tempPassword });
});
