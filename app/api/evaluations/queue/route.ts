import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

/** Instructor's pending evaluation queue — own batches only, oldest first (SRS 12.8). */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);

  let learnerFilter = {};
  if (session.role === 'INSTRUCTOR') {
    const myLearners = await prisma.enrollment.findMany({
      where: { batch: { instructorId: session.userId }, status: 'ACTIVE' },
      select: { learnerId: true },
    });
    learnerFilter = { learnerId: { in: myLearners.map((e) => e.learnerId) } };
  }

  const submissions = await prisma.submission.findMany({
    where: {
      status: 'PENDING',
      material: { section: { module: { organizationId: scope.organizationId } } },
      ...learnerFilter,
    },
    select: {
      id: true, learnerId: true, fileKey: true, isLate: true, createdAt: true,
      material: { select: { id: true, title: true, type: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  const learners = await prisma.user.findMany({
    where: { id: { in: [...new Set(submissions.map((s) => s.learnerId))] } },
    select: { id: true, name: true, email: true },
  });
  const learnerMap = new Map(learners.map((l) => [l.id, l]));

  return NextResponse.json({
    queue: submissions.map(({ learnerId, ...s }) => ({
      ...s,
      learner: learnerMap.get(learnerId) ?? null,
    })),
  });
});

