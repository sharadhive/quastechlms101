import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const schema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
});

export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const s = await prisma.section.findFirst({
    where: { id: ctx.params.id, module: { organizationId: scope.organizationId } },
  });
  if (!s) throw notFound('Section not found');
  const data = await parseBody(req, schema);
  const section = await prisma.section.update({ where: { id: ctx.params.id }, data });
  return NextResponse.json({ section });
});

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const s = await prisma.section.findFirst({
    where: { id: ctx.params.id, module: { organizationId: scope.organizationId } },
  });
  if (!s) throw notFound('Section not found');
  await prisma.section.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
});
