import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { runJob } from './processors';

export type JobType =
  | 'EMAIL_WELCOME'
  | 'EMAIL_FEE_REMINDER'
  | 'EMAIL_SESSION_REMINDER'
  | 'EMAIL_RESULT_PUBLISHED'
  | 'CAMPAIGN_SEND'
  | 'RENDER_CERTIFICATE_PDF'
  | 'RENDER_RECEIPT_PDF';

export async function enqueue(type: JobType, payload: Record<string, unknown>, runAt?: Date) {
  return prisma.jobQueue.create({
    data: { type, payload: payload as Prisma.InputJsonValue, runAt: runAt ?? new Date() },
  });
}

const BACKOFF_MIN = [1, 10, 60]; // 1m / 10m / 1h (SRS 12.10)

/** Claim up to `limit` due jobs atomically and run them. Used by the PM2 worker AND /api/cron/process. */
export async function processJobs(workerId: string, limit = 10): Promise<number> {
  // Atomic claim: row-locked UPDATE, then read back what we claimed.
  const claimed = await prisma.$executeRaw`
    UPDATE JobQueue SET status = 'RUNNING', lockedBy = ${workerId}, updatedAt = NOW()
    WHERE status = 'PENDING' AND runAt <= NOW()
    ORDER BY runAt ASC LIMIT ${limit}`;
  if (claimed === 0) return 0;

  const jobs = await prisma.jobQueue.findMany({
    where: { status: 'RUNNING', lockedBy: workerId },
  });

  for (const job of jobs) {
    try {
      await runJob(job.type as JobType, job.payload as Record<string, unknown>);
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: { status: 'DONE', lockedBy: null },
      });
    } catch (err: any) {
      const attempts = job.attempts + 1;
      const failedFinal = attempts >= job.maxAttempts;
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          attempts,
          lastError: String(err?.message ?? err).slice(0, 2000),
          status: failedFinal ? 'FAILED' : 'PENDING',
          lockedBy: null,
          runAt: failedFinal
            ? job.runAt
            : new Date(Date.now() + (BACKOFF_MIN[attempts - 1] ?? 60) * 60_000),
        },
      });
      console.error(`[job ${job.type}] attempt ${attempts} failed:`, err?.message ?? err);
    }
  }
  return jobs.length;
}
