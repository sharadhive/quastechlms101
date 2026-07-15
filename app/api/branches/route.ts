import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const branches = await prisma.branch.findMany({
    where: { organizationId: scope.organizationId, ...(scope.branchId ? { id: scope.branchId } : {}) },
    include: { _count: { select: { users: true, batches: true } } },
    orderBy: [{ state: 'asc' }, { city: 'asc' }, { name: 'asc' }],
  });

  // geo tree for cascading State → City → Branch selects
  const tree: Record<string, Record<string, { id: string; name: string }[]>> = {};
  for (const b of branches) {
    tree[b.state] ??= {};
    tree[b.state][b.city] ??= [];
    tree[b.state][b.city].push({ id: b.id, name: b.name });
  }
  return NextResponse.json({
    branches,
    states: Object.keys(tree).sort(),
    geoTree: tree,
  });
});

const createSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  state: z.string().min(2),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['SUPER_ADMIN', 'ADMIN']);
  const data = await parseBody(req, createSchema);
  const branch = await prisma.branch.create({
    data: { ...data, organizationId: session.organizationId },
  });
  return NextResponse.json({ branch }, { status: 201 });
});
