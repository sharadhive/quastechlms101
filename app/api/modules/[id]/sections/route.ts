import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, ADMIN_ROLES } from '@/lib/auth/rbac';
import { assertCanEditContent } from '@/lib/auth/content';

const schema = z.object({ title: z.string().min(1), position: z.number().int().nonnegative().optional() });

/** Add a topic (section) to a module. */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  await assertCanEditContent(session, { moduleId: ctx.params.id });
  const data = await parseBody(req, schema);
  const position = data.position ?? (await prisma.section.count({ where: { moduleId: ctx.params.id } }));
  const section = await prisma.section.create({ data: { title: data.title, position, moduleId: ctx.params.id } });
  return NextResponse.json({ section }, { status: 201 });
});
