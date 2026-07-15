import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { resolveBranchIds, geoFromParams } from '@/lib/geo';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const sp = req.nextUrl.searchParams;
  const branchIds = await resolveBranchIds(scope.organizationId, geoFromParams(sp), scope.branchId);
  const batchId = sp.get('batchId') ?? undefined;

  const rows = await prisma.feeAccount.findMany({
    where: {
      pendingAmount: { gt: 0 },
      enrollment: {
        status: 'ACTIVE',
        course: { organizationId: scope.organizationId },
        ...(batchId ? { batchId } : {}),
        ...(branchIds ? { batch: { branchId: { in: branchIds } } } : {}),
      },
    },
    select: {
      totalFee: true,
      discount: true,
      pendingAmount: true,
      enrollment: {
        select: {
          id: true,
          learner: { select: { id: true, name: true, email: true, phone: true } },
          course: { select: { title: true } },
          batch: { select: { name: true, branchId: true } },
        },
      },
    },
    orderBy: { pendingAmount: 'desc' },
  });

  const totalPending = rows.reduce((sum, r) => sum + Number(r.pendingAmount), 0);
  return NextResponse.json({ count: rows.length, totalPending, rows });
});

