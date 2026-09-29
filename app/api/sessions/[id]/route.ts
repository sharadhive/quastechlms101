import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { can } from '@/lib/auth/permissions';
import { queueSessionReminders } from '@/lib/sessions';

async function load(req: NextRequest, id: string) {
  const session = await requireRole(req, [...ADMIN_ROLES, 'INSTRUCTOR']);
  if (session.role === 'INSTRUCTOR' && !(await can(session, 'create_sessions')))
    throw forbidden('Ask an admin to grant you "Schedule their own classes" to change sessions');
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
    include: { _count: { select: { attendance: true } } },
  });
  if (!cls) throw notFound('Session not found');
  return cls;
}

const schema = z.object({
  title: z.string().min(1).optional(),
  scheduledAt: z.string().datetime().optional(),
  meetLink: z.string().url().nullable().optional(),
});

/** Reschedule / rename a class or change its meeting link. Reminders are re-queued for the new time. */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const cls = await load(req, ctx.params.id);
  const data = await parseBody(req, schema);
  const newTime = data.scheduledAt ? new Date(data.scheduledAt) : null;
  const updated = await prisma.classSession.update({
    where: { id: cls.id },
    data: {
      ...(data.title ? { title: data.title } : {}),
      ...(data.meetLink !== undefined ? { meetLink: data.meetLink } : {}),
      ...(newTime ? { scheduledAt: newTime } : {}),
    },
  });
  if (newTime && newTime.getTime() !== cls.scheduledAt.getTime()) await queueSessionReminders(cls.id, newTime);
  return NextResponse.json({ session: updated });
});

/** Cancel a class. Refused once attendance was marked (that history must be kept). */
export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const cls = await load(req, ctx.params.id);
  if (cls._count.attendance > 0) throw conflict('Attendance was already marked for this class, so it cannot be cancelled');
  await prisma.classSession.delete({ where: { id: cls.id } }); // queued reminders see it's gone and skip
  return NextResponse.json({ ok: true });
});
