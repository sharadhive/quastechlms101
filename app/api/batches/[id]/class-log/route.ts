import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { can } from '@/lib/auth/permissions';
import { LIVE_STATUSES } from '@/lib/auth/enrollment';

const LOCK_HOURS = 48;

const schema = z.object({
  /** topics taught in this class (at least one) */
  sectionIds: z.array(z.string().min(1)).min(1, 'Choose at least one topic'),
  /** attendance for the batch roster */
  marks: z.array(z.object({ learnerId: z.string().min(1), present: z.boolean() })),
  /** use an already scheduled class instead of creating a new one */
  sessionId: z.string().min(1).optional(),
  /** when the class happened (defaults to now) */
  heldAt: z.string().datetime().optional(),
  title: z.string().max(190).optional(),
});

/**
 * POST /api/batches/:id/class-log
 * "I taught these topics today and these students were present" — one save:
 * the class session is created (or the scheduled one reused), the topics are marked done
 * and the attendance is stored.
 */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const data = await parseBody(req, schema);

  const batch = await prisma.batch.findFirst({
    where: {
      id: ctx.params.id,
      course: { organizationId: scope.organizationId },
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
  });
  if (!batch) throw notFound('Batch not found');

  // Topics must belong to this batch's course
  const sections = await prisma.section.findMany({
    where: { id: { in: data.sectionIds }, module: { courseModules: { some: { courseId: batch.courseId } } } },
    select: { id: true, title: true },
  });
  if (sections.length !== new Set(data.sectionIds).size) throw badRequest('One of the topics is not part of this course');

  // Which class?
  let cls = data.sessionId
    ? await prisma.classSession.findFirst({ where: { id: data.sessionId, batchId: batch.id } })
    : null;
  if (data.sessionId && !cls) throw notFound('Class not found in this batch');

  const heldAt = cls ? cls.scheduledAt : data.heldAt ? new Date(data.heldAt) : new Date();
  if (heldAt.getTime() > Date.now() + 12 * 3600_000) throw badRequest('You can only log a class that has already happened (or is happening today)');
  if (
    session.role === 'INSTRUCTOR' &&
    heldAt.getTime() + LOCK_HOURS * 3600_000 < Date.now() &&
    !(await can(session, 'attendance_override'))
  ) {
    throw forbidden(`Classes older than ${LOCK_HOURS} hours can only be changed by an admin`);
  }

  const enrolled = new Set(
    (await prisma.enrollment.findMany({
      where: { batchId: batch.id, status: { in: LIVE_STATUSES } },
      select: { learnerId: true },
    })).map((e) => e.learnerId),
  );
  const marks = data.marks.filter((m) => enrolled.has(m.learnerId));

  const result = await prisma.$transaction(async (tx) => {
    if (!cls) {
      cls = await tx.classSession.create({
        data: {
          batchId: batch.id,
          title: data.title?.trim() || sections.map((s) => s.title).join(', ').slice(0, 190),
          scheduledAt: heldAt,
          startedAt: heldAt,
        },
      });
    } else if (!cls.startedAt) {
      cls = await tx.classSession.update({ where: { id: cls.id }, data: { startedAt: new Date() } });
    }
    const sessionId = cls.id;

    for (const s of sections) {
      await tx.sessionTopic.upsert({
        where: { sessionId_sectionId: { sessionId, sectionId: s.id } },
        update: {},
        create: { sessionId, sectionId: s.id },
      });
    }
    for (const m of marks) {
      await tx.attendance.upsert({
        where: { sessionId_learnerId: { sessionId, learnerId: m.learnerId } },
        update: { present: m.present, markedById: session.userId },
        create: { sessionId, learnerId: m.learnerId, present: m.present, markedById: session.userId },
      });
    }
    return { sessionId };
  });

  return NextResponse.json({
    ok: true,
    sessionId: result.sessionId,
    topics: sections.map((s) => s.title),
    present: marks.filter((m) => m.present).length,
    total: marks.length,
  });
});
