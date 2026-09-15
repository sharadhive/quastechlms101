import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

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
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          progressPct: true,
          learner: { select: { id: true, name: true, email: true, phone: true } },
        },
      },
    },
  });
  if (!batch) throw notFound('Batch not found');

  // Build maps: sectionId → { sessionId, coveredAt } and sessionId → attendanceCount
  const sectionSessionMap = new Map<string, { sessionId: string; coveredAt: Date }>();
  const sessionAttendanceMap = new Map<string, number>();

  for (const s of batch.sessions) {
    sessionAttendanceMap.set(s.id, s._count.attendance);
    for (const t of s.topicsCovered) {
      if (!sectionSessionMap.has(t.sectionId)) {
        sectionSessionMap.set(t.sectionId, {
          sessionId: s.id,
          coveredAt: t.coveredAt,
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
  const coveredSections = allCoveredSectionIds.size;

  return NextResponse.json({
    batch: {
      id: batch.id,
      name: batch.name,
      batchTime: (batch as any).batchTime ?? null,
      schedule: (batch as any).schedule ?? null,
      startDate: batch.startDate,
      endDate: batch.endDate,
      course: { id: batch.course.id, title: batch.course.title },
      sessions: batch.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        scheduledAt: s.scheduledAt,
        startedAt: s.startedAt,
        meetLink: s.meetLink,
        topicsCovered: s.topicsCovered.map((t) => t.sectionId),
        attendanceCount: s._count.attendance,
      })),
      enrollments: batch.enrollments,
      curriculum,
      syllabusProgress: totalSections > 0
        ? Math.round((coveredSections / totalSections) * 100)
        : 0,
      totalSections,
      coveredSections,
    },
  });
});
