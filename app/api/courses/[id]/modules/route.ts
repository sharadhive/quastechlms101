import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { assertCanEditContent } from '@/lib/auth/content';

const schema = z
  .object({
    moduleId: z.string().min(1).optional(), // link an existing library module…
    title: z.string().min(2).optional(),    // …or create a new module with this title
    position: z.number().int().nonnegative().optional(),
  })
  .refine((d) => d.moduleId || d.title, { message: 'Give a module title or pick one from the library' });

export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { courseId: ctx.params.id });
  const data = await parseBody(req, schema);
  const courseId = ctx.params.id;

  let moduleId = data.moduleId;
  if (moduleId) {
    const mod = await prisma.module.findFirst({ where: { id: moduleId, organizationId: session.organizationId } });
    if (!mod) throw notFound('Module not found');
  } else {
    const mod = await prisma.module.create({ data: { title: data.title!, organizationId: session.organizationId } });
    moduleId = mod.id;
  }
  const position = data.position ?? (await prisma.courseModule.count({ where: { courseId } }));

  const existing = await prisma.courseModule.findUnique({ where: { courseId_moduleId: { courseId, moduleId } } });
  if (existing) throw badRequest('This module is already in the course');
  const link = await prisma.courseModule.create({ data: { courseId, moduleId, position } });
  return NextResponse.json({ link, moduleId }, { status: 201 });
});

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const moduleId = req.nextUrl.searchParams.get('moduleId');
  if (!moduleId) throw notFound('moduleId required');
  await assertCanEditContent(session, { courseId: ctx.params.id });
  await prisma.courseModule.deleteMany({ where: { courseId: ctx.params.id, moduleId } });
  return NextResponse.json({ ok: true });
});
