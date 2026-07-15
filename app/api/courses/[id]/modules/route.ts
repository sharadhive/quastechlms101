import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const schema = z.object({
  moduleId: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const { moduleId, position } = await parseBody(req, schema);

  const [course, mod] = await Promise.all([
    prisma.course.findFirst({ where: { id: ctx.params.id, organizationId: scope.organizationId } }),
    prisma.module.findFirst({ where: { id: moduleId, organizationId: scope.organizationId } }),
  ]);
  if (!course || !mod) throw notFound('Course or module not found');

  const link = await prisma.courseModule.upsert({
    where: { courseId_moduleId: { courseId: course.id, moduleId } },
    update: { position },
    create: { courseId: course.id, moduleId, position },
  });
  return NextResponse.json({ link }, { status: 201 });
});

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const moduleId = req.nextUrl.searchParams.get('moduleId');
  if (!moduleId) throw notFound('moduleId required');
  const course = await prisma.course.findFirst({
    where: { id: ctx.params.id, organizationId: scope.organizationId },
  });
  if (!course) throw notFound('Course not found');
  await prisma.courseModule.deleteMany({ where: { courseId: course.id, moduleId } });
  return NextResponse.json({ ok: true });
});
