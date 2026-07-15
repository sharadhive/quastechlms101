import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['STUDENT']);
  await prisma.lessonNote.deleteMany({ where: { id: ctx.params.id, userId: session.userId } });
  return NextResponse.json({ ok: true });
});
