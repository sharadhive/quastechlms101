import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden, conflict, badRequest, ApiError } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { can } from '@/lib/auth/permissions';
import { audit } from '@/lib/utils/audit';
import { queueSessionReminders, clearSessionReminders, findClash, notifySessionChange, fmtClassTime } from '@/lib/sessions';

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
    include: { _count: { select: { attendance: true } }, batch: { select: { instructorId: true } } },
  });
  if (!cls) throw notFound('Session not found');
  return { session, cls };
}

const schema = z.object({
  title: z.string().min(1).optional(),
  scheduledAt: z.string().datetime().optional(),
  meetLink: z.string().url().nullable().optional(),
  /** shown to students in the notification / email */
  reason: z.string().trim().max(300).optional(),
  /** default true — tell students (in the panel + email) about a new time or link */
  notifyStudents: z.boolean().optional(),
  /** move it even though another class is less than an hour away */
  force: z.boolean().optional(),
});

/**
 * Reschedule / rename a class or change its meeting link.
 * New time: must be in the future, not clash with the batch's or the instructor's other classes (unless
 * force), old reminders are removed and new ones queued, students and the instructor are told.
 */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { session, cls } = await load(req, ctx.params.id);
  const data = await parseBody(req, schema);

  const newTime = data.scheduledAt ? new Date(data.scheduledAt) : null;
  const moved = !!newTime && newTime.getTime() !== cls.scheduledAt.getTime();
  const linkChanged = data.meetLink !== undefined && (data.meetLink ?? null) !== (cls.meetLink ?? null);

  if (moved) {
    if (cls._count.attendance > 0)
      throw conflict('Attendance was already taken for this class, so it was held and cannot be moved. Schedule a new class instead.');
    if (newTime!.getTime() < Date.now() - 5 * 60_000) throw badRequest('The new time is in the past — pick a future date and time');
    if (!data.force) {
      const clash = await findClash({ sessionId: cls.id, batchId: cls.batchId, instructorId: cls.batch.instructorId, at: newTime! });
      if (clash)
        throw new ApiError(409,
          `“${clash.title}” (${clash.batch.name}) is at ${fmtClassTime(clash.scheduledAt)} — less than an hour from the new time.`,
          'SCHEDULE_CONFLICT');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.classSession.update({
      where: { id: cls.id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.meetLink !== undefined ? { meetLink: data.meetLink } : {}),
        ...(moved ? { scheduledAt: newTime! } : {}),
      },
    });
    if (moved || linkChanged)
      await audit(tx, {
        organizationId: session.organizationId, actorId: session.userId,
        action: moved ? 'session.rescheduled' : 'session.link_changed', entity: 'ClassSession', entityId: cls.id,
        before: { scheduledAt: cls.scheduledAt, meetLink: cls.meetLink },
        after: { scheduledAt: u.scheduledAt, meetLink: u.meetLink, reason: data.reason ?? null },
      });
    return u;
  });

  if (moved) {
    await clearSessionReminders(cls.id);
    await queueSessionReminders(cls.id, newTime!);
  }
  let notified = 0;
  if ((moved || linkChanged) && data.notifyStudents !== false)
    notified = await notifySessionChange({
      batchId: cls.batchId, actorId: session.userId, kind: moved ? 'rescheduled' : 'link',
      title: updated.title, oldAt: cls.scheduledAt, newAt: updated.scheduledAt, meetLink: updated.meetLink, reason: data.reason,
    });
  return NextResponse.json({ session: updated, notified });
});

const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional(),
  notifyStudents: z.boolean().optional(),
});

/** Cancel a class. Refused once attendance was marked (that history must be kept). Students are told. */
export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { session, cls } = await load(req, ctx.params.id);
  if (cls._count.attendance > 0) throw conflict('Attendance was already marked for this class, so it cannot be cancelled');
  // body is optional ({ reason, notifyStudents }) — older screens send none
  const raw = await req.text().catch(() => '');
  let body: unknown = {};
  if (raw) { try { body = JSON.parse(raw); } catch { throw badRequest('Invalid JSON body'); } }
  const data = cancelSchema.parse(body);

  await prisma.$transaction(async (tx) => {
    await tx.classSession.delete({ where: { id: cls.id } });
    await audit(tx, {
      organizationId: session.organizationId, actorId: session.userId,
      action: 'session.cancelled', entity: 'ClassSession', entityId: cls.id,
      before: { title: cls.title, scheduledAt: cls.scheduledAt, batchId: cls.batchId }, after: { reason: data.reason ?? null },
    });
  });
  await clearSessionReminders(cls.id);

  // only worth telling people about a class that hasn't happened yet
  let notified = 0;
  if (data.notifyStudents !== false && cls.scheduledAt.getTime() > Date.now() - 2 * 3600_000)
    notified = await notifySessionChange({
      batchId: cls.batchId, actorId: session.userId, kind: 'cancelled', title: cls.title, oldAt: cls.scheduledAt, reason: data.reason,
    });
  return NextResponse.json({ ok: true, notified });
});
