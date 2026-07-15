import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const schema = z.object({ title: z.string().min(1), position: z.number().int().nonnegative() });

export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const data = await parseBody(req, schema);
  const mod = await prisma.module.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId },
  });
  if (!mod) throw notFound('Module not found');
  const section = await prisma.section.create({ data: { ...data, moduleId: mod.id } });
  return NextResponse.json({ section }, { status: 201 });
});
