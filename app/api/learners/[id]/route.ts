import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);

  const learner = await prisma.user.findFirst({
    where: { id: ctx.params.id, role: 'STUDENT', ...scope }, // out-of-scope UUID → 404
    select: {
      id: true, name: true, email: true, phone: true, lifecycle: true,
      branchId: true, profile: true, createdAt: true,
      enrollments: {
        select: {
          id: true, status: true, enrolledAt: true, progressPct: true,
          course: { select: { id: true, title: true } },
          batch: { select: { id: true, name: true } },
          feeAccount: { select: { totalFee: true, discount: true, pendingAmount: true } },
        },
      },
    },
  });
  if (!learner) throw notFound('Learner not found');
  return NextResponse.json({ learner });
});
