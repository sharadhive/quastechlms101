import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';

/**
 * Leaderboard — batch-wise for students, org-wide for admins.
 *
 * Query params:
 *   ?batchId=xxx  — filter to a specific batch (student view)
 *   (no batchId)  — org-wide leaderboard (admin/instructor view)
 */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const batchId = req.nextUrl.searchParams.get('batchId');

  let userIdScope: string[] | null = null;

  // If batchId is provided, scope leaderboard to students in that batch
  if (batchId) {
    const enrollments = await prisma.enrollment.findMany({
      where: { batchId, status: 'ACTIVE' },
      select: { learnerId: true },
    });
    userIdScope = enrollments.map((e) => e.learnerId);
    if (userIdScope.length === 0) {
      return NextResponse.json({ board: [], myPoints: 0, batchId });
    }
  }

  const totals = await prisma.pointEntry.groupBy({
    by: ['userId'],
    where: {
      organizationId: session.organizationId,
      ...(userIdScope ? { userId: { in: userIdScope } } : {}),
    },
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: 50,
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
    where: {
      organizationId: session.organizationId,
      userId: session.userId,
    },
    _sum: { points: true },
  });

  return NextResponse.json({ board, myPoints: mine._sum.points ?? 0, batchId: batchId ?? null });
});
