import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const LOCK_HOURS = 48;

async function loadScopedSession(req: NextRequest, id: string) {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const cls = await prisma.classSession.findFirst({
    where: {
      id,
      batch: {
        course: { organizationId: scope.organizationId },
        ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
        ...(scope.branchId ? { branchId: scope.branchId } : {}),
      },
    },
    include: { batch: { select: { id: true } } },
  });
  if (!cls) throw notFound('Session not found');
  return { session, cls };
}

/** GET → roster (enrolled learners + current marks) + session context */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { cls } = await loadScopedSession(req, ctx.params.id);
  const full = await prisma.classSession.findUnique({
    where: { id: cls.id },
    select: { scheduledAt: true, topicsCovered: { select: { sectionId: true } } },
  });
  const [enrollments, marks] = await Promise.all([
    prisma.enrollment.findMany({
      where: { batchId: cls.batch.id, status: 'ACTIVE' },
      select: { learner: { select: { id: true, name: true, email: true } } },
    }),
    prisma.attendance.findMany({ where: { sessionId: cls.id } }),
  ]);
  const markMap = new Map(marks.map((m) => [m.learnerId, m.present]));
  const roster = enrollments.map((e) => ({
    ...e.learner,
    present: markMap.get(e.learner.id) ?? null,
  }));
  return NextResponse.json({
    sessionId: cls.id,
    scheduledAt: full?.scheduledAt,
    topicsCovered: full?.topicsCovered.map((t) => t.sectionId) ?? [],
    roster,
  });
});

const postSchema = z.object({
  marks: z.array(z.object({ learnerId: z.string().min(1), present: z.boolean() })).min(1),
});

/** POST → bulk upsert marks. Instructors locked out after 48h; admins can amend (audited via log). */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { session, cls } = await loadScopedSession(req, ctx.params.id);
  const { marks } = await parseBody(req, postSchema);

  const locked = cls.scheduledAt.getTime() + LOCK_HOURS * 3600_000 < Date.now();
  // an admin can grant an instructor the right to edit attendance after the lock window
  if (locked && session.role === 'INSTRUCTOR' && !(await can(session, 'attendance_override')))
    throw forbidden(`Attendance locked after ${LOCK_HOURS}h — contact an admin`);

  // only enrolled learners can be marked
  const enrolled = await prisma.enrollment.findMany({
    where: { batchId: cls.batch.id, status: 'ACTIVE' },
    select: { learnerId: true },
  });
  const enrolledSet = new Set(enrolled.map((e) => e.learnerId));

  await prisma.$transaction(
    marks
      .filter((m) => enrolledSet.has(m.learnerId))
      .map((m) =>
        prisma.attendance.upsert({
          where: { sessionId_learnerId: { sessionId: cls.id, learnerId: m.learnerId } },
          update: { present: m.present, markedById: session.userId },
          create: {
            sessionId: cls.id,
            learnerId: m.learnerId,
            present: m.present,
            markedById: session.userId,
          },
        }),
      ),
  );
  return NextResponse.json({ ok: true, marked: marks.length });
});
