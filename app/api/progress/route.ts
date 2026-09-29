import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, badRequest } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { maybeIssueCertificate } from '@/lib/certificates';
import { onMaterialCompleted } from '@/lib/gamify';
import { LIVE_STATUSES } from '@/lib/auth/enrollment';

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

  const courseLessons = {
    status: 'published',
    section: { module: { courseModules: { some: { courseId: enrollment.courseId } } } },
  };

  // material must belong to this enrollment's course (via module link)
  const material = await prisma.material.findFirst({ where: { id: materialId, ...courseLessons } });
  if (!material) throw notFound('Material not in this course');

  // Quizzes and assignments count only once the work was actually done
  if (material.type === 'QUIZ' || material.type === 'ASSIGNMENT') {
    const sub = await prisma.submission.findUnique({
      where: { materialId_learnerId: { materialId, learnerId: session.userId } },
    });
    const done = material.type === 'QUIZ' ? (sub?.attemptsUsed ?? 0) > 0 : !!sub?.fileKey;
    if (!done) throw badRequest(material.type === 'QUIZ' ? 'Submit the quiz first' : 'Submit the assignment first');
  }

  // idempotent upsert (composite PK)
  await prisma.materialProgress.upsert({
    where: { enrollmentId_materialId: { enrollmentId, materialId } },
    update: {},
    create: { enrollmentId, materialId },
  });

  // recompute against the lessons that exist NOW (deleted/hidden lessons don't count)
  const lessonIds = (await prisma.material.findMany({ where: courseLessons, select: { id: true } })).map((m) => m.id);
  const completed = await prisma.materialProgress.count({
    where: { enrollmentId, materialId: { in: lessonIds } },
  });
  const total = lessonIds.length;
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 10000) / 100) : 0;

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPct: new Prisma.Decimal(pct),
      ...(pct >= 100 && enrollment.status === 'ACTIVE' ? { status: 'COMPLETED' } : {}),
    },
  });

  // certificate auto-issue rule evaluated on each progress update (SRS 12.11)
  await maybeIssueCertificate(enrollmentId, pct);
  // gamification: points + badges (merged feature)
  await onMaterialCompleted(session.organizationId, session.userId, pct).catch(() => {});

  return NextResponse.json({ progressPct: pct, completed, total });
});
