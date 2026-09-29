import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { enqueue } from '@/lib/jobs/queue';

/** Publish result → student notification + email (SRS 12.8) */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);

  // instructors may publish only for learners in their own batches
  const myLearners =
    session.role === 'INSTRUCTOR'
      ? (await prisma.enrollment.findMany({ where: { batch: { instructorId: session.userId } }, select: { learnerId: true } }))
          .map((e) => e.learnerId)
      : null;
  const submission = await prisma.submission.findFirst({
    where: {
      id: ctx.params.id,
      material: { section: { module: { organizationId: scope.organizationId } } },
      ...(myLearners ? { learnerId: { in: myLearners } } : {}),
    },
    include: { material: { select: { title: true } } },
  });
  if (!submission) throw notFound('Submission not found');
  if (submission.status !== 'EVALUATED') throw badRequest('Evaluate before publishing');

  await prisma.$transaction([
    prisma.submission.update({ where: { id: submission.id }, data: { status: 'PUBLISHED' } }),
    prisma.notification.create({
      data: {
        userId: submission.learnerId,
        type: 'RESULT_PUBLISHED',
        title: 'Result published',
        body: `Your result for "${submission.material.title}" is available.`,
        link: '/app/results',
      },
    }),
  ]);
  await enqueue('EMAIL_RESULT_PUBLISHED', {
    learnerId: submission.learnerId,
    materialTitle: submission.material.title,
  });
  return NextResponse.json({ ok: true });
});
