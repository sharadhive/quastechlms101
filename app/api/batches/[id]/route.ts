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
          topicsCovered: { select: { sectionId: true } },
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

  // Compute which sections have been covered across all sessions
  const allCoveredSectionIds = new Set<string>();
  for (const s of batch.sessions) {
    for (const t of s.topicsCovered) {
      allCoveredSectionIds.add(t.sectionId);
    }
  }

  // Build curriculum with coverage status
  const curriculum = batch.course.courseModules.map((cm) => ({
    moduleTitle: cm.module.title,
    position: cm.position,
    sections: cm.module.sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      position: sec.position,
      covered: allCoveredSectionIds.has(sec.id),
    })),
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
