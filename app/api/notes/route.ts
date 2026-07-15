import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const materialId = req.nextUrl.searchParams.get('materialId');
  if (!materialId) throw notFound('materialId required');
  const notes = await prisma.lessonNote.findMany({
    where: { userId: session.userId, materialId }, // own notes only
    orderBy: { timestampSec: 'asc' },
  });
  return NextResponse.json({ notes });
});

const schema = z.object({
  materialId: z.string().min(1),
  enrollmentId: z.string().min(1),
  content: z.string().min(1),
  timestampSec: z.number().int().nonnegative().default(0),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const data = await parseBody(req, schema);
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: data.enrollmentId, learnerId: session.userId },
  });
  if (!enrollment) throw notFound('Enrollment not found');
  const note = await prisma.lessonNote.create({ data: { ...data, userId: session.userId } });
  return NextResponse.json({ note }, { status: 201 });
});
