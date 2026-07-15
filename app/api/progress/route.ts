import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { maybeIssueCertificate } from '@/lib/certificates';
import { onMaterialCompleted } from '@/lib/gamify';

const schema = z.object({
  enrollmentId: z.string().min(1),
  materialId: z.string().min(1),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const { enrollmentId, materialId } = await parseBody(req, schema);

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, learnerId: session.userId, status: 'ACTIVE' },
    include: { course: { select: { id: true } } },
  });
  if (!enrollment) throw notFound('Enrollment not found');

  // material must belong to this enrollment's course (via module link)
  const material = await prisma.material.findFirst({
    where: {
      id: materialId,
      status: 'published',
      section: { module: { courseModules: { some: { courseId: enrollment.courseId } } } },
    },
  });
  if (!material) throw notFound('Material not in this course');

  // idempotent upsert (composite PK)
  await prisma.materialProgress.upsert({
    where: { enrollmentId_materialId: { enrollmentId, materialId } },
    update: {},
    create: { enrollmentId, materialId },
  });

  // recompute: completed / totalPublishedMaterials × 100
  const [completed, total] = await Promise.all([
    prisma.materialProgress.count({ where: { enrollmentId } }),
    prisma.material.count({
      where: {
        status: 'published',
        section: { module: { courseModules: { some: { courseId: enrollment.courseId } } } },
      },
    }),
  ]);
  const pct = total > 0 ? Math.round((completed / total) * 10000) / 100 : 0;

  await prisma.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPct: new Prisma.Decimal(pct),
      ...(pct >= 100 ? { status: 'COMPLETED' } : {}),
    },
  });

  // certificate auto-issue rule evaluated on each progress update (SRS 12.11)
  await maybeIssueCertificate(enrollmentId, pct);
  // gamification: points + badges (merged feature)
  await onMaterialCompleted(session.organizationId, session.userId, pct).catch(() => {});

  return NextResponse.json({ progressPct: pct, completed, total });
});

