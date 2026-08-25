import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { thumbnailUrl } from '@/lib/utils/thumbnail';

const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'seed-org';

/** Public GET /api/catalog — browse all published+public courses */
export const GET = withHandler(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const category = sp.get('category')?.trim();
  const priceType = sp.get('priceType'); // 'free' | 'paid' | null (all)
  const sort = sp.get('sort') ?? 'newest'; // popular | newest | price_asc | price_desc
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(sp.get('pageSize') ?? 20)));

  const where: any = {
    organizationId: ORG_ID,
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    ...(q ? {
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { category: { contains: q } },
      ],
    } : {}),
    ...(category ? { category } : {}),
    ...(priceType === 'free' ? { OR: [{ isFree: true }, { price: 0 }] } : {}),
    ...(priceType === 'paid' ? { isFree: false, price: { gt: 0 } } : {}),
  };

  const orderBy: any =
    sort === 'popular' ? { enrollments: { _count: 'desc' } } :
    sort === 'price_asc' ? { price: 'asc' } :
    sort === 'price_desc' ? { price: 'desc' } :
    { createdAt: 'desc' };

  const [total, courses] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        thumbnailKey: true,
        category: true,
        price: true,
        isFree: true,
        createdAt: true,
        _count: {
          select: { enrollments: true },
        },
        courseModules: {
          select: {
            module: {
              select: {
                _count: { select: { sections: true } },
                sections: {
                  select: { _count: { select: { materials: true } } },
                },
              },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Get average ratings for these courses
  const courseIds = courses.map((c) => c.id);
  const ratings = courseIds.length > 0 ? await prisma.courseReview.groupBy({
    by: ['courseId'],
    where: { courseId: { in: courseIds } },
    _avg: { rating: true },
    _count: { rating: true },
  }) : [];
  const ratingMap = new Map(ratings.map((r) => [r.courseId, { avg: r._avg.rating ?? 0, count: r._count.rating }]));

  // Get all categories for filter dropdown
  const categories = await prisma.course.findMany({
    where: { organizationId: ORG_ID, status: 'PUBLISHED', category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  });

  const result = await Promise.all(courses.map(async (c) => {
    const totalModules = c.courseModules.length;
    const totalLessons = c.courseModules.reduce((acc, cm) =>
      acc + cm.module.sections.reduce((s, sec) => s + sec._count.materials, 0), 0);
    const rating = ratingMap.get(c.id) ?? { avg: 0, count: 0 };
    return {
      id: c.id,
      title: c.title,
      description: c.description ? c.description.slice(0, 200) : null,
      thumbnailUrl: await thumbnailUrl(c.thumbnailKey),
      category: c.category,
      price: c.price,
      isFree: c.isFree || Number(c.price) === 0,
      enrolledCount: c._count.enrollments,
      totalModules,
      totalLessons,
      avgRating: Math.round(rating.avg * 10) / 10,
      reviewCount: rating.count,
      createdAt: c.createdAt,
    };
  }));

  return NextResponse.json({
    total, page, pageSize,
    courses: result,
    categories: categories.map((c) => c.category).filter(Boolean),
  });
});
