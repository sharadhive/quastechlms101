import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { assertCanEditContent } from '@/lib/auth/content';

const schema = z.object({
  title: z.string().min(2).optional(),
  courseId: z.string().min(1).optional(),          // reorder within a course
  position: z.number().int().nonnegative().optional(),
});

export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { moduleId: ctx.params.id });
  const data = await parseBody(req, schema);

  if (data.title) await prisma.module.update({ where: { id: ctx.params.id }, data: { title: data.title } });
  if (data.courseId && typeof data.position === 'number') {
    const link = await prisma.courseModule.findUnique({
      where: { courseId_moduleId: { courseId: data.courseId, moduleId: ctx.params.id } },
    });
    if (!link) throw badRequest('This module is not part of that course');
    await prisma.courseModule.update({
      where: { courseId_moduleId: { courseId: data.courseId, moduleId: ctx.params.id } },
      data: { position: data.position },
    });
  }
  return NextResponse.json({ ok: true });
});

/** Detach a module from a course (module stays in the library). */
export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) throw notFound('courseId required');
  await assertCanEditContent(session, { courseId });
  await prisma.courseModule.deleteMany({ where: { courseId, moduleId: ctx.params.id } });
  return NextResponse.json({ ok: true });
});
