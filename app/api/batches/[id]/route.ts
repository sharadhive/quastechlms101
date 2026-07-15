import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const batch = await prisma.batch.findFirst({
    where: {
      id: ctx.params.id,
      course: { organizationId: scope.organizationId },
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
    },
    include: {
      course: { select: { id: true, title: true } },
      sessions: { orderBy: { scheduledAt: 'asc' } },
      enrollments: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          progressPct: true,
          learner: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
    },
  });
  if (!batch) throw notFound('Batch not found');
  return NextResponse.json({ batch });
});
