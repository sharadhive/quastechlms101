import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from') ? new Date(sp.get('from')!) : new Date();
  const to = sp.get('to') ? new Date(sp.get('to')!) : new Date(Date.now() + 30 * 86400_000);

  const sessions = await prisma.classSession.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      batch: { enrollments: { some: { learnerId: session.userId, status: { in: ['ACTIVE', 'COMPLETED'] } } } },
    },
    select: {
      id: true, title: true, scheduledAt: true, meetLink: true,
      batch: { select: { name: true, course: { select: { title: true } } } },
    },
    orderBy: { scheduledAt: 'asc' },
  });
  return NextResponse.json({ sessions });
});

