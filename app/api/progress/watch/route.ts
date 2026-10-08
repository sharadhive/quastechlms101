import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { LIVE_STATUSES } from '@/lib/auth/enrollment';
import {
  completeMaterial, courseLessonsWhere, mergeRanges, parseRanges, secondsNeeded, totalSeconds,
  MAX_PLAYBACK_RATE, type WatchRange,
} from '@/lib/progress';

/**
 * Video watch tracking.
 *
 * While a video plays, the player sends the parts that were really played (seeking over a
 * part does not count). The server keeps the union of those parts and, once 90% of the video
 * is covered, marks the lesson complete — there is no manual "Mark as complete" for videos.
 *
 * The server does not simply trust the player: it never credits more new seconds than could
 * have been played in the real time since the previous report (at the fastest speed, 2×).
 */
const schema = z.object({
  enrollmentId: z.string().min(1),
  materialId: z.string().min(1),
  ranges: z.array(z.tuple([z.number().nonnegative(), z.number().nonnegative()])).max(500).default([]),
  durationSec: z.number().positive().max(86400).optional(),
  positionSec: z.number().nonnegative().optional(),
});

const FIRST_REPORT_ALLOWANCE_SEC = 20;
const SLACK_SEC = 20;

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const body = await parseBody(req, schema);
  const { enrollmentId, materialId } = body;

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, learnerId: session.userId, status: { in: LIVE_STATUSES } },
  });
  if (!enrollment) throw notFound('Enrollment not found');

  const material = await prisma.material.findFirst({
    where: { id: materialId, type: 'VIDEO', ...courseLessonsWhere(enrollment.courseId) },
  });
  if (!material) throw notFound('Video not in this course');

  const key = { enrollmentId_materialId: { enrollmentId, materialId } };
  const [record, done] = await Promise.all([
    prisma.videoWatch.findUnique({ where: key }),
    prisma.materialProgress.findUnique({ where: key }),
  ]);

  // Length of the video: the value saved at upload, else what the player measured
  const reported = body.durationSec ? Math.floor(body.durationSec) : 0;
  const duration =
    material.durationSec && material.durationSec > 0 ? material.durationSec : Math.max(record?.durationSec ?? 0, reported);

  const now = new Date();
  const before = mergeRanges(parseRanges(record?.ranges), duration);
  const beforeSec = totalSeconds(before);
  let ranges = before;
  let watchedSec = beforeSec;
  let accepted = true;

  if (duration > 0 && body.ranges.length > 0) {
    const merged = mergeRanges([...before, ...(body.ranges as WatchRange[])], duration);
    const added = totalSeconds(merged) - beforeSec;
    // real-time check: new seconds cannot exceed what fits in the time since the last report
    const allowance = record
      ? ((now.getTime() - record.lastPingAt.getTime()) / 1000) * MAX_PLAYBACK_RATE + SLACK_SEC
      : FIRST_REPORT_ALLOWANCE_SEC;
    if (added <= allowance) {
      ranges = merged;
      watchedSec = beforeSec + added;
    } else {
      accepted = false; // keep the old state; the player simply reports again a little later
    }
  }

  const positionSec = Math.floor(body.positionSec ?? record?.positionSec ?? 0);
  if (!record) {
    await prisma.videoWatch
      .create({ data: { enrollmentId, materialId, ranges, watchedSec, durationSec: duration, positionSec, lastPingAt: now } })
      .catch((e: any) => { if (e?.code !== 'P2002') throw e; }); // two first reports at once — the next one updates
  } else if (accepted) {
    await prisma.videoWatch.update({
      where: key,
      data: { ranges, watchedSec, durationSec: duration, positionSec, lastPingAt: now },
    });
  }

  const neededSec = duration > 0 ? secondsNeeded(duration) : 0;
  let justCompleted = false;
  let progress: { progressPct: number; completed: number; total: number } | null = null;
  if (!done && neededSec > 0 && watchedSec >= neededSec) {
    const r = await completeMaterial(enrollment, materialId, session);
    justCompleted = r.newlyCompleted;
    progress = { progressPct: r.progressPct, completed: r.completed, total: r.total };
  }

  return NextResponse.json({
    watchedSec,
    durationSec: duration,
    neededSec,
    watchedPct: duration > 0 ? Math.min(100, Math.floor((watchedSec / duration) * 100)) : 0,
    completed: !!done || (neededSec > 0 && watchedSec >= neededSec),
    justCompleted,
    progress,
  });
});
