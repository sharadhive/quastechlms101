import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { can } from '@/lib/auth/permissions';
import { enqueue } from '@/lib/jobs/queue';

const schema = z.object({
  title: z.string().min(1),
  scheduledAt: z.string().datetime(),
  meetLink: z.string().url().optional(), // manual Zoom/Meet paste — v1 feature
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

  const scheduledAt = new Date(data.scheduledAt);
  const cls = await prisma.classSession.create({
    data: { batchId: batch.id, title: data.title, scheduledAt, meetLink: data.meetLink },
  });

  // reminders: T-24h and T-1h (skips past times automatically)
  for (const offsetH of [24, 1]) {
    const runAt = new Date(scheduledAt.getTime() - offsetH * 3600_000);
    if (runAt > new Date())
      await enqueue('EMAIL_SESSION_REMINDER', { sessionId: cls.id, offsetH }, runAt);
  }

  return NextResponse.json({ session: cls }, { status: 201 });
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
