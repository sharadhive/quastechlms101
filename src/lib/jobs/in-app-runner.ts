/**
 * Background jobs processed INSIDE the Next.js server every 15 s (emails, receipt and
 * certificate PDFs, reminders, campaigns) so nothing waits for a separate worker.
 * processJobs() claims jobs atomically, so running `npm run worker` or the cron URL
 * at the same time is safe. Set JOBS_IN_APP=false to switch this off.
 * Loaded only by instrumentation.ts on the Node.js runtime.
 */
const g = globalThis as unknown as { __qsJobsStarted?: boolean };

if (process.env.JOBS_IN_APP !== 'false' && !g.__qsJobsStarted) {
  g.__qsJobsStarted = true; // dev hot-reload guard
  const workerId = `app-${process.pid}`;
  const tick = async () => {
    try {
      const { processJobs } = await import('./queue');
      const n = await processJobs(workerId, 10);
      if (n > 0) console.log(`[jobs] processed ${n} job(s)`);
    } catch (err: any) {
      console.error('[jobs] poll error:', err?.message ?? err);
    } finally {
      setTimeout(tick, 15_000);
    }
  };
  setTimeout(tick, 5_000);
}

export {};
