import { Prisma, type EnrollStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { maybeIssueCertificate } from '@/lib/certificates';
import { onMaterialCompleted } from '@/lib/gamify';

/** A video lesson is complete once this share of it has really been played. */
export const VIDEO_COMPLETE_RATIO = 0.9;

/** Fastest speed the player offers (2×) plus a little tolerance for timer drift. */
export const MAX_PLAYBACK_RATE = 2.2;

/** A stretch of video that was played: [startSec, endSec) in whole seconds. */
export type WatchRange = [number, number];

/** Union of ranges — sorted, non-overlapping, clipped to 0…maxSec. */
export function mergeRanges(ranges: WatchRange[], maxSec: number): WatchRange[] {
  const clean = ranges
    .map(([a, b]) => [Math.max(0, Math.floor(a)), Math.min(maxSec, Math.floor(b))] as WatchRange)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: WatchRange[] = [];
  for (const [a, b] of clean) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export const totalSeconds = (ranges: WatchRange[]) => ranges.reduce((n, [a, b]) => n + (b - a), 0);

/** Seconds that must be played before a video of this length counts as complete. */
export const secondsNeeded = (durationSec: number) => Math.max(1, Math.floor(durationSec * VIDEO_COMPLETE_RATIO));

/** Stored JSON → ranges (tolerates anything unexpected in the column). */
export function parseRanges(value: unknown): WatchRange[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is [number, number] => Array.isArray(r) && r.length === 2 && Number.isFinite(r[0]) && Number.isFinite(r[1]))
    .map(([a, b]) => [Number(a), Number(b)] as WatchRange);
}

/** Prisma filter: the published lessons of one course. */
export const courseLessonsWhere = (courseId: string) => ({
  status: 'published',
  section: { module: { courseModules: { some: { courseId } } } },
});

/**
 * Mark one lesson complete for an enrollment and refresh the course progress.
 * Safe to call more than once: points and badges are given only the first time.
 */
export async function completeMaterial(
  enrollment: { id: string; courseId: string; status: EnrollStatus },
  materialId: string,
  learner: { organizationId: string; userId: string },
) {
  let newlyCompleted = true;
  try {
    await prisma.materialProgress.create({ data: { enrollmentId: enrollment.id, materialId } });
  } catch (e: any) {
    if (e?.code === 'P2002') newlyCompleted = false; // already completed earlier
    else throw e;
  }

  // recompute against the lessons that exist NOW (deleted/hidden lessons don't count)
  const lessonIds = (
    await prisma.material.findMany({ where: courseLessonsWhere(enrollment.courseId), select: { id: true } })
  ).map((m) => m.id);
  const completed = await prisma.materialProgress.count({
    where: { enrollmentId: enrollment.id, materialId: { in: lessonIds } },
  });
  const total = lessonIds.length;
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 10000) / 100) : 0;

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      progressPct: new Prisma.Decimal(pct),
      ...(pct >= 100 && enrollment.status === 'ACTIVE' ? { status: 'COMPLETED' } : {}),
    },
  });

  // certificate auto-issue rule evaluated on each progress update (SRS 12.11)
  await maybeIssueCertificate(enrollment.id, pct);
  // gamification: points + badges — once per lesson, never again for a repeat
  if (newlyCompleted) await onMaterialCompleted(learner.organizationId, learner.userId, pct).catch(() => {});

  return { progressPct: pct, completed, total, newlyCompleted };
}
