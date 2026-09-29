import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { can } from '@/lib/auth/permissions';
import { LIVE_STATUSES } from '@/lib/auth/enrollment';
import { audit } from '@/lib/utils/audit';

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const batch = await prisma.batch.findFirst({
    where: {
      id: ctx.params.id,
      course: { organizationId: scope.organizationId },
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
    },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          // Include full curriculum for syllabus tracking
          courseModules: {
            orderBy: { position: 'asc' },
            include: {
              module: {
                include: {
                  sections: {
                    orderBy: { position: 'asc' },
                    select: { id: true, title: true, position: true },
                  },
                },
              },
            },
          },
        },
      },
      sessions: {
        orderBy: { scheduledAt: 'asc' },
        include: {
          topicsCovered: { select: { sectionId: true, coveredAt: true } },
          _count: { select: { attendance: true } },
        },
      },
      enrollments: {
        where: { status: { in: LIVE_STATUSES } },
        select: {
          id: true,
          status: true,
          progressPct: true,
          learner: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy: { learner: { name: 'asc' } },
      },
    },
  });
  if (!batch) throw notFound('Batch not found');
  // Instructors see phone/email only with the "See learner contact details" permission
  const showContacts = await can(session, 'view_contacts');
  const instructor = batch.instructorId
    ? await prisma.user.findUnique({ where: { id: batch.instructorId }, select: { id: true, name: true } })
    : null;

  // Build maps: sectionId → { sessionId, coveredAt } and sessionId → attendanceCount
  const sectionSessionMap = new Map<string, { sessionId: string; coveredAt: Date }>();
  const sessionAttendanceMap = new Map<string, number>();

  for (const s of batch.sessions) {
    sessionAttendanceMap.set(s.id, s._count.attendance);
    for (const t of s.topicsCovered) {
      if (!sectionSessionMap.has(t.sectionId)) {
        sectionSessionMap.set(t.sectionId, {
          sessionId: s.id,
          coveredAt: s.scheduledAt, // the day the class happened
        });
      }
    }
  }

  // Get attendance details per session for attendance summary
  const allAttendance = await prisma.attendance.findMany({
    where: { sessionId: { in: batch.sessions.map((s) => s.id) } },
    select: { sessionId: true, present: true },
  });
  const sessionAttendanceDetail = new Map<string, { present: number; total: number }>();
  for (const a of allAttendance) {
    const entry = sessionAttendanceDetail.get(a.sessionId) || { present: 0, total: 0 };
    entry.total++;
    if (a.present) entry.present++;
    sessionAttendanceDetail.set(a.sessionId, entry);
  }

  // Compute which sections have been covered across all sessions
  const allCoveredSectionIds = new Set<string>(sectionSessionMap.keys());

  // Build curriculum with coverage status, coveredAt, sessionId, and attendance summary
  const curriculum = batch.course.courseModules.map((cm) => ({
    moduleTitle: cm.module.title,
    moduleId: cm.module.id,
    position: cm.position,
    sections: cm.module.sections.map((sec) => {
      const sessionInfo = sectionSessionMap.get(sec.id);
      const attDetail = sessionInfo
        ? sessionAttendanceDetail.get(sessionInfo.sessionId)
        : null;
      return {
        id: sec.id,
        title: sec.title,
        position: sec.position,
        covered: allCoveredSectionIds.has(sec.id),
        coveredAt: sessionInfo?.coveredAt?.toISOString() ?? null,
        sessionId: sessionInfo?.sessionId ?? null,
        attendance: attDetail
          ? { present: attDetail.present, total: attDetail.total }
          : null,
      };
    }),
  }));

  const totalSections = curriculum.reduce((a, m) => a + m.sections.length, 0);
  const coveredSections = curriculum.reduce((a, m) => a + m.sections.filter((s) => s.covered).length, 0);
  const sectionTitle = new Map(curriculum.flatMap((m) => m.sections.map((s) => [s.id, s.title] as const)));

  return NextResponse.json({
    batch: {
      id: batch.id,
      name: batch.name,
      batchTime: batch.batchTime ?? null,
      schedule: batch.schedule ?? null,
      startDate: batch.startDate,
      endDate: batch.endDate,
      capacity: batch.capacity,
      branchId: batch.branchId,
      instructorId: batch.instructorId,
      instructor,
      course: { id: batch.course.id, title: batch.course.title },
      sessions: batch.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        scheduledAt: s.scheduledAt,
        startedAt: s.startedAt,
        meetLink: s.meetLink,
        topicsCovered: s.topicsCovered.map((t) => t.sectionId),
        topicTitles: s.topicsCovered.map((t) => sectionTitle.get(t.sectionId)).filter(Boolean),
        attendanceCount: s._count.attendance,
        attendance: sessionAttendanceDetail.get(s.id) ?? null,
      })),
      enrollments: batch.enrollments.map((e) => ({
        ...e,
        learner: showContacts ? e.learner : { id: e.learner.id, name: e.learner.name, email: null, phone: null },
      })),
      curriculum,
      syllabusProgress: totalSections > 0
        ? Math.round((coveredSections / totalSections) * 100)
        : 0,
      totalSections,
      coveredSections,
    },
  });
});

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  instructorId: z.string().min(1).nullable().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().nullable().optional(),
  capacity: z.number().int().positive().nullable().optional(),
  batchTime: z.string().nullable().optional(),
  schedule: z.enum(['WEEKDAY', 'WEEKEND', 'CUSTOM']).nullable().optional(),
  branchId: z.string().min(1).optional(),
});

/** Edit a batch: rename, change instructor, dates, capacity, timing. */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const data = await parseBody(req, patchSchema);
  const batch = await prisma.batch.findFirst({
    where: { id: ctx.params.id, course: { organizationId: scope.organizationId }, ...(scope.branchId ? { branchId: scope.branchId } : {}) },
    include: { _count: { select: { enrollments: { where: { status: { in: LIVE_STATUSES } } } } } },
  });
  if (!batch) throw notFound('Batch not found');

  if (data.instructorId) {
    const ins = await prisma.user.findFirst({
      where: { id: data.instructorId, role: 'INSTRUCTOR', isActive: true, organizationId: scope.organizationId },
    });
    if (!ins) throw badRequest('Instructor not found or inactive');
  }
  if (data.branchId) {
    if (scope.branchId && data.branchId !== scope.branchId) throw badRequest('You can only use your own branch');
    const b = await prisma.branch.findFirst({ where: { id: data.branchId, organizationId: scope.organizationId } });
    if (!b) throw badRequest('Branch not found');
  }
  if (data.capacity && data.capacity < batch._count.enrollments)
    throw badRequest(`Capacity can't be below the ${batch._count.enrollments} learners already in this batch`);
  const start = data.startDate ? new Date(data.startDate) : batch.startDate;
  const end = data.endDate === undefined ? batch.endDate : data.endDate ? new Date(data.endDate) : null;
  if (end && end < start) throw badRequest('End date must be after the start date');

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.batch.update({
      where: { id: batch.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.instructorId !== undefined ? { instructorId: data.instructorId } : {}),
        ...(data.startDate ? { startDate: start } : {}),
        ...(data.endDate !== undefined ? { endDate: end } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.batchTime !== undefined ? { batchTime: data.batchTime } : {}),
        ...(data.schedule !== undefined ? { schedule: data.schedule } : {}),
        ...(data.branchId ? { branchId: data.branchId } : {}),
      },
    });
    await audit(tx, {
      organizationId: scope.organizationId, actorId: session.userId, action: 'BATCH_UPDATE',
      entity: 'Batch', entityId: batch.id,
      before: { instructorId: batch.instructorId, capacity: batch.capacity, startDate: batch.startDate },
      after: { instructorId: u.instructorId, capacity: u.capacity, startDate: u.startDate },
    });
    return u;
  });
  return NextResponse.json({ batch: updated });
});

/** Delete an empty batch (created by mistake). Batches with learners must be emptied first. */
export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const batch = await prisma.batch.findFirst({
    where: { id: ctx.params.id, course: { organizationId: scope.organizationId }, ...(scope.branchId ? { branchId: scope.branchId } : {}) },
    include: { _count: { select: { enrollments: true } } },
  });
  if (!batch) throw notFound('Batch not found');
  if (batch._count.enrollments > 0)
    throw conflict('This batch has learners. Move them to another batch (from the learner profile) before deleting.');
  await prisma.batch.delete({ where: { id: batch.id } }); // sessions + recordings cascade
  return NextResponse.json({ ok: true });
});
