import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { LIVE_STATUSES } from '@/lib/auth/enrollment';
import { completeMaterial, courseLessonsWhere, secondsNeeded } from '@/lib/progress';

const schema = z.object({
  enrollmentId: z.string().min(1),
  materialId: z.string().min(1),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const { enrollmentId, materialId } = await parseBody(req, schema);

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, learnerId: session.userId, status: { in: LIVE_STATUSES } },
  });
  if (!enrollment) throw notFound('Enrollment not found');

  // material must belong to this enrollment's course (via module link)
  const material = await prisma.material.findFirst({
    where: { id: materialId, ...courseLessonsWhere(enrollment.courseId) },
  });
  if (!material) throw notFound('Material not in this course');

  // Quizzes and assignments count only once the work was actually done
  if (material.type === 'QUIZ' || material.type === 'ASSIGNMENT') {
    const sub = await prisma.submission.findUnique({
      where: { materialId_learnerId: { materialId, learnerId: session.userId } },
    });
    const done = material.type === 'QUIZ' ? (sub?.attemptsUsed ?? 0) > 0 : !!sub?.fileKey;
    if (!done) throw badRequest(material.type === 'QUIZ' ? 'Submit the quiz first' : 'Submit the assignment first');
  }

  // Videos count only once they were really watched — see /api/progress/watch.
  // (A video that was already complete stays complete.)
  if (material.type === 'VIDEO') {
    const key = { enrollmentId_materialId: { enrollmentId, materialId } };
    const already = await prisma.materialProgress.findUnique({ where: key });
    if (!already) {
      const watch = await prisma.videoWatch.findUnique({ where: key });
      const duration = material.durationSec && material.durationSec > 0 ? material.durationSec : watch?.durationSec ?? 0;
      if (!watch || duration <= 0 || watch.watchedSec < secondsNeeded(duration))
        throw badRequest('Watch at least 90% of the video — it is marked complete automatically');
    }
  }

  const { progressPct, completed, total } = await completeMaterial(enrollment, materialId, session);
  return NextResponse.json({ progressPct, completed, total });
});
