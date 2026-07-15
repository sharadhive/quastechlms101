import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const cls = await prisma.classSession.findFirst({
    where: {
      id: ctx.params.id,
      batch: {
        course: { organizationId: scope.organizationId },
        ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      },
    },
  });
  if (!cls) throw notFound('Session not found');
  const updated = await prisma.classSession.update({
    where: { id: cls.id },
    data: { startedAt: cls.startedAt ?? new Date() }, // idempotent
  });
  return NextResponse.json({ session: updated, meetLink: updated.meetLink });
});
