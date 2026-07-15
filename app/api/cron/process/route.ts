import { NextResponse, type NextRequest } from 'next/server';
import { withHandler, unauthorized } from '@/lib/utils/errors';
import { processJobs } from '@/lib/jobs/queue';

/**
 * cPanel path (SRS Ch. 7 / A.1): cron every minute →
 *   curl -s -H "x-cron-key: $CRON_KEY" https://domain.com/api/cron/process
 * VPS path uses the PM2 worker (worker.ts) instead.
 */
export const POST = withHandler(async (req: NextRequest) => {
  const key = req.headers.get('x-cron-key');
  if (!key || key !== process.env.CRON_KEY) throw unauthorized();
  const processed = await processJobs(`cron-${Date.now()}`, 25);
  return NextResponse.json({ processed });
});

export const GET = POST; // some cPanel cron setups can only GET

