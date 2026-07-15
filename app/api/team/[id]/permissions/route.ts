import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope } from '@/lib/auth/rbac';
import { INSTRUCTOR_PERMISSIONS } from '@/lib/auth/permissions';
import { audit } from '@/lib/utils/audit';

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN', 'ADMIN']);
  const scope = tenantScope(session);
  const user = await prisma.user.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId },
    select: { id: true, name: true, role: true, permissions: true },
  });
  if (!user) throw notFound('Team member not found');
  return NextResponse.json({
    user, catalogue: INSTRUCTOR_PERMISSIONS,
    permissions: (user.permissions ?? {}) as Record<string, boolean>,
  });
});

const schema = z.object({ permissions: z.record(z.boolean()) });

/** Grant / revoke instructor capabilities. Every change is audit-logged. */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN', 'ADMIN']);
  const scope = tenantScope(session);
  const user = await prisma.user.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId, role: 'INSTRUCTOR' },
  });
  if (!user) throw notFound('Instructor not found');
  const { permissions } = await parseBody(req, schema);

  const valid = new Set(INSTRUCTOR_PERMISSIONS.map((p) => p.key as string));
  const clean = Object.fromEntries(Object.entries(permissions).filter(([k]) => valid.has(k)));

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { permissions: clean } });
    await audit(tx, {
      organizationId: scope.organizationId, actorId: session.userId,
      action: 'permissions.update', entity: 'User', entityId: user.id,
      before: user.permissions ?? {}, after: clean,
    });
  });
  return NextResponse.json({ ok: true, permissions: clean });
});
