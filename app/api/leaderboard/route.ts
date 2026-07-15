import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';

/** Org-wide points leaderboard (merged gamification feature). */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const totals = await prisma.pointEntry.groupBy({
    by: ['userId'],
    where: { organizationId: session.organizationId },
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: 20,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: totals.map((t) => t.userId) } },
    select: { id: true, name: true },
  });
  const umap = new Map(users.map((u) => [u.id, u.name]));
  const board = totals.map((t, i) => ({
    rank: i + 1, userId: t.userId, name: umap.get(t.userId) ?? 'Learner',
    points: t._sum.points ?? 0, me: t.userId === session.userId,
  }));
  const mine = await prisma.pointEntry.aggregate({
    where: { organizationId: session.organizationId, userId: session.userId }, _sum: { points: true },
  });
  return NextResponse.json({ board, myPoints: mine._sum.points ?? 0 });
});
