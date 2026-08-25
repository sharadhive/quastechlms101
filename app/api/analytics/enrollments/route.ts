import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const months = Math.min(24, Number(req.nextUrl.searchParams.get('months') ?? 6));
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      enrolledAt: { gte: since },
      course: { organizationId: scope.organizationId },
      ...(scope.branchId ? { batch: { branchId: scope.branchId } } : {}),
    },
    select: { enrolledAt: true, batch: { select: { branchId: true } } },
  });

  const trend: Record<string, Record<string, number>> = {};
  for (const e of enrollments) {
    const ym = e.enrolledAt.toISOString().slice(0, 7); // YYYY-MM
    trend[ym] ??= {};
    const bid = e.batch?.branchId ?? 'unassigned';
    trend[ym][bid] = (trend[ym][bid] ?? 0) + 1;
  }
  return NextResponse.json({ months, trend });
});

