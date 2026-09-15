import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

const schema = z.object({
  sectionId: z.string().min(1),
  completed: z.boolean(),
});

/**
 * PUT /api/batches/:id/topics
 * Toggle a topic (section) as complete/incomplete for a batch.
 * - completed=true  → auto-creates a ClassSession + SessionTopic link
 * - completed=false → removes the SessionTopic (and the auto-created session if it has no other topics)
 */
export const PUT = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const { sectionId, completed } = await parseBody(req, schema);

  // Verify batch belongs to this instructor/org
  const batch = await prisma.batch.findFirst({
    where: {
      id: ctx.params.id,
      course: { organizationId: scope.organizationId },
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
  });
  if (!batch) throw notFound('Batch not found');

  // Verify section exists and belongs to this batch's course
  const sectionCheck = await prisma.section.findFirst({
    where: {
      id: sectionId,
      module: {
        courseModules: { some: { courseId: batch.courseId } },
      },
    },
    select: { id: true, title: true },
  });
  if (!sectionCheck) throw notFound('Topic not found in this course');

  if (completed) {
    // Check if already covered in any session of this batch
    const existing = await prisma.sessionTopic.findFirst({
      where: {
        sectionId,
        session: { batchId: batch.id },
      },
    });
    if (existing) {
      return NextResponse.json({ ok: true, alreadyCovered: true, sessionId: existing.sessionId });
    }

    // Auto-create a ClassSession and link the topic
    const now = new Date();
    const cls = await prisma.classSession.create({
      data: {
        batchId: batch.id,
        title: sectionCheck.title,
        scheduledAt: now,
        startedAt: now, // mark as held immediately
      },
    });
    await prisma.sessionTopic.create({
      data: { sessionId: cls.id, sectionId },
    });

    return NextResponse.json({
      ok: true,
      sessionId: cls.id,
      coveredAt: now.toISOString(),
    });
  } else {
    // Find the SessionTopic for this section in this batch
    const link = await prisma.sessionTopic.findFirst({
      where: {
        sectionId,
        session: { batchId: batch.id },
      },
      select: { sessionId: true, sectionId: true },
    });

    if (link) {
      // Remove the topic link
      await prisma.sessionTopic.delete({
        where: { sessionId_sectionId: { sessionId: link.sessionId, sectionId: link.sectionId } },
      });

      // If the session has no other topics and no attendance, clean it up
      const [remainingTopics, attendanceCount] = await Promise.all([
        prisma.sessionTopic.count({ where: { sessionId: link.sessionId } }),
        prisma.attendance.count({ where: { sessionId: link.sessionId } }),
      ]);
      if (remainingTopics === 0 && attendanceCount === 0) {
        await prisma.classSession.delete({ where: { id: link.sessionId } });
      }
    }

    return NextResponse.json({ ok: true, uncovered: true });
  }
});
