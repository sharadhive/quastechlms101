import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { enqueue } from '@/lib/jobs/queue';

const schema = z.object({
  title: z.string().min(1).optional(),       // optional — auto-set from topic name if not provided
  scheduledAt: z.string().datetime(),
  meetLink: z.string().url().optional(),      // manual Zoom/Meet paste — v1 feature
  moduleId: z.string().min(1).optional(),     // optional — assign to a module
  sectionId: z.string().min(1).optional(),    // optional — assign to a specific topic
});

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

  // Resolve title from section if not provided
  let title = data.title || '';
  let sectionIds: string[] = [];

  if (data.sectionId) {
    // Single specific topic selected
    const sec = await prisma.section.findFirst({
      where: {
        id: data.sectionId,
        module: { courseModules: { some: { courseId: batch.courseId } } },
      },
      select: { id: true, title: true },
    });
    if (!sec) throw notFound('Topic not found in this course');
    if (!title) title = sec.title;
    sectionIds = [sec.id];
  } else if (data.moduleId) {
    // All topics in the module
    const mod = await prisma.module.findFirst({
      where: {
        id: data.moduleId,
        courseModules: { some: { courseId: batch.courseId } },
      },
      include: {
        sections: { orderBy: { position: 'asc' }, select: { id: true, title: true } },
      },
    });
    if (!mod) throw notFound('Module not found in this course');
    if (!title) title = mod.title;
    sectionIds = mod.sections.map((s) => s.id);
  }

  if (!title) title = 'Class Session';

  const scheduledAt = new Date(data.scheduledAt);
  const cls = await prisma.classSession.create({
    data: { batchId: batch.id, title, scheduledAt, meetLink: data.meetLink },
  });

  // Link topics if any were selected
  if (sectionIds.length > 0) {
    await prisma.$transaction(
      sectionIds.map((sectionId) =>
        prisma.sessionTopic.create({ data: { sessionId: cls.id, sectionId } }),
      ),
    );
  }

  // reminders: T-24h and T-1h (skips past times automatically)
  for (const offsetH of [24, 1]) {
    const runAt = new Date(scheduledAt.getTime() - offsetH * 3600_000);
    if (runAt > new Date())
      await enqueue('EMAIL_SESSION_REMINDER', { sessionId: cls.id, offsetH }, runAt);
  }

  return NextResponse.json({ session: cls, linkedTopics: sectionIds.length }, { status: 201 });
});

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  const scope = tenantScope(session);
  const sessions = await prisma.classSession.findMany({
    where: {
      batchId: ctx.params.id,
      batch: {
        course: { organizationId: scope.organizationId },
        ...(session.role === 'INSTRUCTOR' ? { instructorId: session.userId } : {}),
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });
  return NextResponse.json({ sessions });
});
