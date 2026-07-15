import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const schema = z.object({
  title: z.string().min(2).optional(),
  courseId: z.string().min(1).optional(),          // reorder within a course
  position: z.number().int().nonnegative().optional(),
});

export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const mod = await prisma.module.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId },
  });
  if (!mod) throw notFound('Module not found');
  const data = await parseBody(req, schema);

  if (data.title) await prisma.module.update({ where: { id: mod.id }, data: { title: data.title } });
  if (data.courseId && typeof data.position === 'number')
    await prisma.courseModule.update({
      where: { courseId_moduleId: { courseId: data.courseId, moduleId: mod.id } },
      data: { position: data.position },
    });
  return NextResponse.json({ ok: true });
});

/** Detach a module from a course (module stays in the library). */
export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const courseId = req.nextUrl.searchParams.get('courseId');
  const mod = await prisma.module.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId },
  });
  if (!mod || !courseId) throw notFound('Module not found');
  await prisma.courseModule.delete({
    where: { courseId_moduleId: { courseId, moduleId: mod.id } },
  });
  return NextResponse.json({ ok: true });
});
