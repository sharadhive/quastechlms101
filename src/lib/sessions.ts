import { prisma } from '@/lib/prisma';
import { enqueue } from '@/lib/jobs/queue';

/** Queue the T-24h and T-1h class reminders (past times are skipped). */
export async function queueSessionReminders(sessionId: string, scheduledAt: Date) {
  for (const offsetH of [24, 1]) {
    const runAt = new Date(scheduledAt.getTime() - offsetH * 3600_000);
    if (runAt > new Date())
      await enqueue(
        'EMAIL_SESSION_REMINDER',
        { sessionId, offsetH, scheduledAt: scheduledAt.toISOString() },
        runAt,
      );
  }
}

/** Remove reminders not sent yet (class moved or cancelled) — so a class moved and moved back is not announced twice. */
export async function clearSessionReminders(sessionId: string) {
  await prisma.jobQueue.deleteMany({
    where: { type: 'EMAIL_SESSION_REMINDER', status: 'PENDING', payload: { path: '$.sessionId', equals: sessionId } },
  });
}

const TZ = () => process.env.APP_TIMEZONE ?? 'Asia/Kolkata';
export const fmtClassTime = (d: Date) =>
  d.toLocaleString('en-IN', { timeZone: TZ(), weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Classes are not given a length, so two classes closer than this count as a clash. */
export const CLASH_WINDOW_MS = 60 * 60_000;

/** Another class of the same batch, or of the same instructor in any batch, less than an hour away. */
export async function findClash(opts: { sessionId?: string; batchId: string; instructorId: string | null; at: Date }) {
  return prisma.classSession.findFirst({
    where: {
      ...(opts.sessionId ? { id: { not: opts.sessionId } } : {}),
      scheduledAt: { gt: new Date(opts.at.getTime() - CLASH_WINDOW_MS), lt: new Date(opts.at.getTime() + CLASH_WINDOW_MS) },
      OR: [{ batchId: opts.batchId }, ...(opts.instructorId ? [{ batch: { instructorId: opts.instructorId } }] : [])],
    },
    select: { title: true, scheduledAt: true, batch: { select: { name: true } } },
    orderBy: { scheduledAt: 'asc' },
  });
}

/**
 * Tell everyone in the batch (and the instructor, when someone else made the change) that a class
 * moved, was cancelled or got a new meeting link: a notification in the panel + an email.
 */
export async function notifySessionChange(opts: {
  batchId: string;
  actorId: string;
  kind: 'rescheduled' | 'cancelled' | 'link';
  title: string;
  oldAt: Date;
  newAt?: Date;
  meetLink?: string | null;
  reason?: string;
}) {
  const batch = await prisma.batch.findUnique({
    where: { id: opts.batchId },
    select: {
      id: true, name: true, instructorId: true,
      course: { select: { title: true } },
      enrollments: {
        where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: { learner: { select: { id: true, name: true, email: true, isActive: true } } },
      },
    },
  });
  if (!batch) return 0;

  const people = batch.enrollments.map((e) => e.learner).filter((l) => l.isActive)
    .map((l) => ({ ...l, link: '/app/calendar' }));
  if (batch.instructorId && batch.instructorId !== opts.actorId) {
    const ins = await prisma.user.findUnique({ where: { id: batch.instructorId }, select: { id: true, name: true, email: true, isActive: true } });
    if (ins?.isActive) people.push({ ...ins, link: `/instructor/batches/${batch.id}` });
  }
  if (!people.length) return 0;

  const when = opts.newAt ?? opts.oldAt;
  const title =
    opts.kind === 'cancelled' ? `Class cancelled: ${opts.title}`
      : opts.kind === 'rescheduled' ? `Class moved: ${opts.title}`
        : `New meeting link: ${opts.title}`;
  const body =
    (opts.kind === 'cancelled' ? `${fmtClassTime(opts.oldAt)} is cancelled.`
      : opts.kind === 'rescheduled' ? `Now ${fmtClassTime(when)} (was ${fmtClassTime(opts.oldAt)}).`
        : `For the class on ${fmtClassTime(when)}.`) + (opts.reason ? ` Reason: ${opts.reason}` : '');

  await prisma.notification.createMany({
    data: people.map((p) => ({ userId: p.id, type: `SESSION_${opts.kind.toUpperCase()}`, title, body, link: p.link })),
  });
  for (const p of people) {
    await enqueue('EMAIL_SESSION_CHANGED', {
      to: p.email, name: p.name, kind: opts.kind, title: opts.title,
      courseTitle: batch.course.title, batchName: batch.name,
      oldAt: opts.oldAt.toISOString(), newAt: opts.newAt?.toISOString(),
      meetLink: opts.meetLink ?? null, reason: opts.reason ?? null,
    });
  }
  return people.length;
}
