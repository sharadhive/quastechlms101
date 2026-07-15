import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const LOW_THRESHOLD = 75;

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const batchId = req.nextUrl.searchParams.get('batchId');
  if (!batchId) throw notFound('batchId required');

  const batch = await prisma.batch.findFirst({
    where: {
      id: batchId,
      course: { organizationId: scope.organizationId },
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
    include: {
      sessions: { where: { scheduledAt: { lte: new Date() } }, select: { id: true } },
      enrollments: {
        where: { status: 'ACTIVE' },
        select: { learner: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!batch) throw notFound('Batch not found');

  const sessionIds = batch.sessions.map((s) => s.id);
  const marks = sessionIds.length
    ? await prisma.attendance.findMany({ where: { sessionId: { in: sessionIds } } })
    : [];

  const presentCount = new Map<string, number>();
  for (const m of marks)
    if (m.present) presentCount.set(m.learnerId, (presentCount.get(m.learnerId) ?? 0) + 1);

  const report = batch.enrollments.map((e) => {
    const present = presentCount.get(e.learner.id) ?? 0;
    const pct = sessionIds.length ? Math.round((present / sessionIds.length) * 100) : null;
    return { ...e.learner, present, totalSessions: sessionIds.length, pct, low: pct !== null && pct < LOW_THRESHOLD };
  });

  return NextResponse.json({ batchId, totalSessions: sessionIds.length, report });
});

