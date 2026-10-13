import { NextResponse, type NextRequest } from 'next/server';
import { withHandler, unauthorized } from '@/lib/utils/errors';
import { processJobs } from '@/lib/jobs/queue';

/**
 * Runs queued background jobs (emails, reminders, PDFs, campaigns). Call it every minute when the
 * server can sleep or has no always-on process (cPanel, Vercel, Render free) — see DEPLOYMENT.md:
 *   curl -s -H "x-cron-key: $CRON_KEY" https://domain.com/api/cron/process
 * Vercel Cron sends "Authorization: Bearer $CRON_SECRET" instead — both are accepted.
 * VPS path can use the PM2 worker (worker.ts) instead.
 */
export const POST = withHandler(async (req: NextRequest) => {
  const allowed = [process.env.CRON_KEY, process.env.CRON_SECRET].filter((k): k is string => !!k);
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const key = req.headers.get('x-cron-key') ?? bearer;
  if (!key || !allowed.includes(key)) throw unauthorized();
  const processed = await processJobs(`cron-${Date.now()}`, 25);
  return NextResponse.json({ processed });
});

export const GET = POST; // some cPanel cron setups can only GET

