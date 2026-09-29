import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { assertCanEditContent } from '@/lib/auth/content';
import { getStorage } from '@/lib/adapters/storage';

const schema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
});

export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { sectionId: ctx.params.id });
  const data = await parseBody(req, schema);
  const section = await prisma.section.update({ where: { id: ctx.params.id }, data });
  return NextResponse.json({ section });
});

/** Delete a topic and its lessons — refused when students already submitted work in it. */
export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { sectionId: ctx.params.id });

  const materials = await prisma.material.findMany({
    where: { sectionId: ctx.params.id },
    select: { id: true, fileKey: true, variants: { select: { fileKey: true } }, _count: { select: { submissions: true } } },
  });
  const withWork = materials.filter((m) => m._count.submissions > 0).length;
  if (withWork > 0)
    throw conflict(`${withWork} lesson(s) in this topic have student submissions. Hide those lessons instead of deleting.`);

  await prisma.section.delete({ where: { id: ctx.params.id } });
  const storage = getStorage();
  for (const m of materials)
    for (const key of [m.fileKey, ...m.variants.map((v) => v.fileKey)])
      if (key) await storage.delete(key).catch(() => {});
  return NextResponse.json({ ok: true });
});
