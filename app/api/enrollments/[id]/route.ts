import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { audit } from '@/lib/utils/audit';
import { LIVE_STATUSES } from '@/lib/auth/enrollment';

const schema = z.object({
  /** ACTIVE (reactivate) · DROPPED · EXPIRED · COMPLETED */
  status: z.enum(['ACTIVE', 'DROPPED', 'EXPIRED', 'COMPLETED']).optional(),
  /** move to another batch of the SAME course (null = self-paced, no batch) */
  batchId: z.string().min(1).nullable().optional(),
  /** course access end date (null = no expiry) */
  accessExpiry: z.string().datetime().nullable().optional(),
});

/** PATCH /api/enrollments/:id — drop, reactivate, expire, transfer batch, extend access. */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const data = await parseBody(req, schema);

  const enr = await prisma.enrollment.findFirst({
    where: {
      id: ctx.params.id,
      course: { organizationId: scope.organizationId },
      ...(scope.branchId ? { learner: { branchId: scope.branchId } } : {}),
    },
    include: { course: { select: { title: true } } },
  });
  if (!enr) throw notFound('Enrollment not found');

  if (data.batchId) {
    const batch = await prisma.batch.findFirst({
      where: { id: data.batchId, courseId: enr.courseId, ...(scope.branchId ? { branchId: scope.branchId } : {}) },
      include: { _count: { select: { enrollments: { where: { status: { in: LIVE_STATUSES } } } } } },
    });
    if (!batch) throw badRequest('That batch is not for this course');
    if (batch.id !== enr.batchId && batch.capacity && batch._count.enrollments >= batch.capacity)
      throw conflict(`Batch "${batch.name}" is full`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.enrollment.update({
      where: { id: enr.id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.batchId !== undefined ? { batchId: data.batchId } : {}),
        ...(data.accessExpiry !== undefined
          ? { accessExpiry: data.accessExpiry ? new Date(data.accessExpiry) : null }
          : {}),
      },
    });
    // Keep the learner's lifecycle in step with their enrollments
    if (data.status) {
      const live = await tx.enrollment.count({
        where: { learnerId: enr.learnerId, status: 'ACTIVE' },
      });
      const done = await tx.enrollment.count({ where: { learnerId: enr.learnerId, status: 'COMPLETED' } });
      await tx.user.update({
        where: { id: enr.learnerId },
        data: { lifecycle: live > 0 ? 'ACTIVE' : done > 0 ? 'COMPLETED' : 'DROPPED' },
      });
    }
    await audit(tx, {
      organizationId: scope.organizationId, actorId: session.userId, action: 'ENROLLMENT_UPDATE',
      entity: 'Enrollment', entityId: enr.id,
      before: { status: enr.status, batchId: enr.batchId, accessExpiry: enr.accessExpiry },
      after: { status: u.status, batchId: u.batchId, accessExpiry: u.accessExpiry },
    });
    return u;
  });
  return NextResponse.json({ enrollment: updated });
});
