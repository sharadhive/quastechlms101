/**
 * Jobs worker — run with PM2 on a VPS:
 *   pm2 start "npm run worker" --name quastech-worker
 * (cPanel path uses a cron hitting /api/cron/process instead — SRS Ch. 7)
 */
import 'dotenv/config';
import crypto from 'crypto';
import { processJobs } from './src/lib/jobs/queue';

const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
const POLL_MS = 15_000;

async function loop() {
  try {
    const n = await processJobs(workerId, 10);
    if (n > 0) console.log(`[${workerId}] processed ${n} job(s)`);
  } catch (err) {
    console.error(`[${workerId}] poll error`, err);
  } finally {
    setTimeout(loop, POLL_MS);
  }
}

console.log(`[${workerId}] started — polling every ${POLL_MS / 1000}s`);
loop();
