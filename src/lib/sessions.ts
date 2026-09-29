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
