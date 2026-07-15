import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const schema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
  isDownloadable: z.boolean().optional(),
  status: z.enum(['processing', 'published']).optional(),
});

async function owned(id: string, organizationId: string) {
  const m = await prisma.material.findFirst({
    where: { id, section: { module: { organizationId } } },
  });
  if (!m) throw notFound('Material not found');
  return m;
}

export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  await owned(ctx.params.id, scope.organizationId);
  const data = await parseBody(req, schema);
  const material = await prisma.material.update({ where: { id: ctx.params.id }, data });
  return NextResponse.json({ material });
});

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  await owned(ctx.params.id, scope.organizationId);
  await prisma.material.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
});
