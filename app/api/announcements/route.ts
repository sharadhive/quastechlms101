import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { requireSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { LIVE_STATUSES } from '@/lib/auth/enrollment';

/** Role-aware feed: students see ALL + announcements for their courses/batches. */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireSession(req);
  let where: any = { organizationId: session.organizationId };
  if (session.role === 'STUDENT') {
    const enrollments = await prisma.enrollment.findMany({
      where: { learnerId: session.userId, status: { in: LIVE_STATUSES } },
      select: { courseId: true, batchId: true },
    });
    const batchIds = enrollments.map((e) => e.batchId).filter((b): b is string => !!b);
    where = {
      organizationId: session.organizationId,
      OR: [
        { audience: 'ALL' },
        { audience: 'COURSE', courseId: { in: enrollments.map((e) => e.courseId) } },
        { audience: 'BATCH', batchId: { in: batchIds } },
      ],
    };
  }
  const announcements = await prisma.announcement.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 30,
  });
  return NextResponse.json({ announcements });
});

const schema = z.object({
  title: z.string().min(2),
  message: z.string().min(2),
  audience: z.enum(['ALL', 'COURSE', 'BATCH']).default('ALL'),
  courseId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const data = await parseBody(req, schema);

  // Instructors may only announce to their OWN batches (permission model per requirement)
  if (session.role === 'INSTRUCTOR') {
    if (!(await can(session, 'announce')))
      throw forbidden('Ask an admin to grant you "Post announcements"');
    if (data.audience !== 'BATCH' || !data.batchId)
      throw forbidden('Instructors can announce only to their own batches');
    const own = await prisma.batch.findFirst({
      where: { id: data.batchId, instructorId: session.userId, course: { organizationId: scope.organizationId } },
    });
    if (!own) throw notFound('Batch not found');
  }

  const announcement = await prisma.announcement.create({
    data: {
      organizationId: scope.organizationId,
      title: data.title, message: data.message, audience: data.audience,
      courseId: data.courseId, batchId: data.batchId, createdById: session.userId,
    },
  });
  return NextResponse.json({ announcement }, { status: 201 });
});
