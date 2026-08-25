import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';
import { thumbnailUrl } from '@/lib/utils/thumbnail';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const enrollments = await prisma.enrollment.findMany({
    where: { learnerId: session.userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
    select: {
      id: true,
      learnerId: true,
      assignedById: true,
      courseId: true,
      status: true,
      progressPct: true,
      enrolledAt: true,
      course: { select: { id: true, title: true, thumbnailKey: true, category: true } },
      batch: { select: { id: true, name: true, startDate: true } },
    },
    orderBy: { enrolledAt: 'desc' },
  });
  const result = await Promise.all(
    enrollments.map(async (e) => ({
      ...e,
      course: { ...e.course, thumbnailUrl: await thumbnailUrl(e.course.thumbnailKey) },
    })),
  );
  return NextResponse.json({ enrollments: result });
});

