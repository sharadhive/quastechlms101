import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { thumbnailUrl } from '@/lib/utils/thumbnail';

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'seed-org';

/** Public GET /api/catalog/:courseId — course detail page */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { courseId: string } }) => {
  const course = await prisma.course.findFirst({
    where: {
      id: ctx.params.courseId,
      organizationId: ORG_ID,
      status: 'PUBLISHED',
    },
    include: {
      courseModules: {
        orderBy: { position: 'asc' },
        include: {
          module: {
            include: {
              sections: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  title: true,
                  position: true,
                  _count: { select: { materials: true } },
                },
              },
            },
          },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });

  if (!course) throw notFound('Course not found');

  // Get reviews
  const [reviews, reviewAgg] = await Promise.all([
    prisma.courseReview.findMany({
      where: { courseId: course.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { rating: true, title: true, comment: true, createdAt: true, learnerId: true },
    }),
    prisma.courseReview.aggregate({
      where: { courseId: course.id },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]);

  // Get reviewer names
  const reviewerIds = reviews.map((r) => r.learnerId);
  const reviewers = reviewerIds.length ? await prisma.user.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, name: true },
  }) : [];
  const nameMap = new Map(reviewers.map((u) => [u.id, u.name]));

  const curriculum = course.courseModules.map((cm) => ({
    moduleTitle: cm.module.title,
    position: cm.position,
    sections: cm.module.sections.map((s) => ({
      title: s.title,
      position: s.position,
      lessonCount: s._count.materials,
    })),
  }));

  const totalLessons = curriculum.reduce((a, m) =>
    a + m.sections.reduce((s, sec) => s + sec.lessonCount, 0), 0);

  return NextResponse.json({
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: await thumbnailUrl(course.thumbnailKey),
      category: course.category,
      price: course.price,
      isFree: course.isFree || Number(course.price) === 0,
      enrolledCount: course._count.enrollments,
      totalModules: curriculum.length,
      totalLessons,
      curriculum,
      avgRating: Math.round((reviewAgg._avg.rating ?? 0) * 10) / 10,
      reviewCount: reviewAgg._count.rating,
      reviews: reviews.map((r) => ({
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        reviewer: nameMap.get(r.learnerId) ?? 'Student',
        createdAt: r.createdAt,
      })),
    },
  });
});
