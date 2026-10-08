import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, forbidden } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';
import { LIVE_STATUSES } from '@/lib/auth/enrollment';

/**
 * Leaderboard.
 *
 * STUDENTS only ever see the learners of their OWN batch — never another batch and never the
 * whole organisation. `?batchId=` picks one of their batches (default: the latest one); a
 * batch they are not in is refused. A student without a batch sees only their own row.
 *
 * Staff: `?batchId=` shows that batch, no batchId shows the organisation-wide top 50.
 */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  const requested = req.nextUrl.searchParams.get('batchId');
  let batchId: string | null = requested;

  const myTotal = async () =>
    (
      await prisma.pointEntry.aggregate({
        where: { organizationId: session.organizationId, userId: session.userId },
        _sum: { points: true },
      })
    )._sum.points ?? 0;

  if (session.role === 'STUDENT') {
    const mine = await prisma.enrollment.findMany({
      where: { learnerId: session.userId, status: { in: LIVE_STATUSES }, batchId: { not: null } },
      select: { batchId: true },
      orderBy: { enrolledAt: 'desc' },
    });
    const myBatchIds = mine.map((e) => e.batchId as string);
    if (requested && !myBatchIds.includes(requested))
      throw forbidden('You can only see the leaderboard of your own batch');
    batchId = requested ?? myBatchIds[0] ?? null;

    if (!batchId) {
      // not in any batch yet — nobody else is shown
      const myPoints = await myTotal();
      const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } });
      return NextResponse.json({
        board: [{ rank: 1, userId: session.userId, name: me?.name ?? 'Learner', points: myPoints, me: true }],
        myPoints,
        batchId: null,
        noBatch: true,
      });
    }
  }

  // ── One batch: every learner of that batch, ranked by points ──
  if (batchId) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        batchId,
        status: { in: LIVE_STATUSES },
        learner: { organizationId: session.organizationId, role: 'STUDENT' },
      },
      select: { learner: { select: { id: true, name: true } } },
    });
    const roster = new Map(enrollments.map((e) => [e.learner.id, e.learner.name]));
    const totals = roster.size
      ? await prisma.pointEntry.groupBy({
          by: ['userId'],
          where: { organizationId: session.organizationId, userId: { in: [...roster.keys()] } },
          _sum: { points: true },
        })
      : [];
    const points = new Map(totals.map((t) => [t.userId, t._sum.points ?? 0]));

    const board = [...roster.entries()]
      .map(([userId, name]) => ({ userId, name: name ?? 'Learner', points: points.get(userId) ?? 0 }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .map((r, i) => ({ rank: i + 1, ...r, me: r.userId === session.userId }));

    return NextResponse.json({ board, myPoints: await myTotal(), batchId });
  }

  // ── Staff, no batch chosen: organisation-wide top 50 ──
  const totals = await prisma.pointEntry.groupBy({
    by: ['userId'],
    where: { organizationId: session.organizationId },
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

  return NextResponse.json({ board, myPoints: await myTotal(), batchId: null });
});
