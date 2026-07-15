import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireSession } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/rbac';

/** GET ?courseId= — reviews + average (any authenticated role). */
export const GET = withHandler(async (req: NextRequest) => {
  await requireSession(req);
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) throw notFound('courseId required');
  const [reviews, agg] = await Promise.all([
    prisma.courseReview.findMany({ where: { courseId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.courseReview.aggregate({ where: { courseId }, _avg: { rating: true }, _count: true }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: reviews.map((r) => r.learnerId) } }, select: { id: true, name: true },
  });
  const umap = new Map(users.map((u) => [u.id, u.name]));
  return NextResponse.json({
    avg: agg._avg.rating, count: agg._count,
    reviews: reviews.map((r) => ({ ...r, learnerName: umap.get(r.learnerId) ?? 'Learner' })),
  });
});

const schema = z.object({
  courseId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  comment: z.string().optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const data = await parseBody(req, schema);
  const enrolled = await prisma.enrollment.findFirst({
    where: { learnerId: session.userId, courseId: data.courseId, status: { in: ['ACTIVE', 'COMPLETED'] } },
  });
  if (!enrolled) throw forbidden('Only enrolled learners can review');
  const review = await prisma.courseReview.upsert({
    where: { courseId_learnerId: { courseId: data.courseId, learnerId: session.userId } },
    update: { rating: data.rating, title: data.title, comment: data.comment },
    create: { ...data, learnerId: session.userId },
  });
  return NextResponse.json({ review }, { status: 201 });
});
