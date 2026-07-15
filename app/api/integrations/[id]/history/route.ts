import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

/** Full change history for one integration — every version can be restored. */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN']);
  const rows = await prisma.integrationHistory.findMany({
    where: { integrationId: ctx.params.id, organizationId: session.organizationId },
    orderBy: { changedAt: 'desc' },
    take: 50,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.changedById))] } },
    select: { id: true, name: true },
  });
  const umap = new Map(users.map((u) => [u.id, u.name]));
  return NextResponse.json({
    history: rows.map((r) => ({
      id: r.id, action: r.action, name: r.name, config: r.config,
      changedAt: r.changedAt, changedBy: umap.get(r.changedById) ?? 'system',
    })),
  });
});
