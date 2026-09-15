import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';

/**
 * GET /api/batches/:id/topic-attendance?sectionId=xxx
 * Returns the roster for a topic (section) within a batch, with attendance marks.
 */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const sectionId = req.nextUrl.searchParams.get('sectionId');
  if (!sectionId) throw notFound('sectionId required');

  const batch = await prisma.batch.findFirst({
    where: {
      id: ctx.params.id,
      course: { organizationId: scope.organizationId },
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
  });
  if (!batch) throw notFound('Batch not found');

  // Find the session linked to this topic in this batch
  const topicLink = await prisma.sessionTopic.findFirst({
    where: {
      sectionId,
      session: { batchId: batch.id },
    },
    select: { sessionId: true },
  });

  // Get enrolled students
  const enrollments = await prisma.enrollment.findMany({
    where: { batchId: batch.id, status: 'ACTIVE' },
    select: { learner: { select: { id: true, name: true, email: true } } },
    orderBy: { learner: { name: 'asc' } },
  });

  // Get attendance marks if a session exists for this topic
  let marks: Map<string, boolean> = new Map();
  if (topicLink) {
    const att = await prisma.attendance.findMany({
      where: { sessionId: topicLink.sessionId },
    });
    marks = new Map(att.map((a) => [a.learnerId, a.present]));
  }

  const roster = enrollments.map((e) => ({
    ...e.learner,
    present: marks.get(e.learner.id) ?? null, // null = not yet marked
  }));

  return NextResponse.json({
    sessionId: topicLink?.sessionId ?? null,
    roster,
    total: roster.length,
    present: roster.filter((r) => r.present === true).length,
    absent: roster.filter((r) => r.present === false).length,
    unmarked: roster.filter((r) => r.present === null).length,
  });
});

const postSchema = z.object({
  sectionId: z.string().min(1),
  marks: z.array(z.object({
    learnerId: z.string().min(1),
    present: z.boolean(),
  })).min(1),
});

/**
 * POST /api/batches/:id/topic-attendance
 * Save attendance for a topic. Auto-creates session if topic is not yet marked complete.
 */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const { sectionId, marks } = await parseBody(req, postSchema);

  const batch = await prisma.batch.findFirst({
    where: {
      id: ctx.params.id,
      course: { organizationId: scope.organizationId },
      ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
  });
  if (!batch) throw notFound('Batch not found');

  // Find or create the session for this topic
  let topicLink = await prisma.sessionTopic.findFirst({
    where: {
      sectionId,
      session: { batchId: batch.id },
    },
    select: { sessionId: true },
  });

  if (!topicLink) {
    // Auto-create session + link (topic gets marked complete along with attendance)
    const sectionData = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { title: true },
    });
    const now = new Date();
    const cls = await prisma.classSession.create({
      data: {
        batchId: batch.id,
        title: sectionData?.title || 'Class Session',
        scheduledAt: now,
        startedAt: now,
      },
    });
    await prisma.sessionTopic.create({
      data: { sessionId: cls.id, sectionId },
    });
    topicLink = { sessionId: cls.id };
  }

  // Only allow marking enrolled students
  const enrolled = await prisma.enrollment.findMany({
    where: { batchId: batch.id, status: 'ACTIVE' },
    select: { learnerId: true },
  });
  const enrolledSet = new Set(enrolled.map((e) => e.learnerId));

  // Upsert attendance
  await prisma.$transaction(
    marks
      .filter((m) => enrolledSet.has(m.learnerId))
      .map((m) =>
        prisma.attendance.upsert({
          where: { sessionId_learnerId: { sessionId: topicLink!.sessionId, learnerId: m.learnerId } },
          update: { present: m.present, markedById: session.userId },
          create: {
            sessionId: topicLink!.sessionId,
            learnerId: m.learnerId,
            present: m.present,
            markedById: session.userId,
          },
        }),
      ),
  );

  return NextResponse.json({ ok: true, marked: marks.length, sessionId: topicLink.sessionId });
});
