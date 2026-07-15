import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const enrollments = await prisma.enrollment.findMany({
    where: { learnerId: session.userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
    select: {
      id: true,
      status: true,
      progressPct: true,
      enrolledAt: true,
      course: { select: { id: true, title: true, thumbnailKey: true, category: true } },
      batch: { select: { id: true, name: true, startDate: true } },
    },
    orderBy: { enrolledAt: 'desc' },
  });
  return NextResponse.json({ enrollments });
});

