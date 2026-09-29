import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';
import { getStorage } from '@/lib/adapters/storage';
import { accessibleEnrollment } from '@/lib/auth/enrollment';
import { taughtCourseIds } from '@/lib/auth/content';

const SIGNED_TTL_SEC = 4 * 3600; // 4 hours (SRS 4.2)

export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireSession(req);

  const material = await prisma.material.findUnique({
    where: { id: ctx.params.id },
    include: {
      section: { select: { moduleId: true, module: { select: { organizationId: true } } } },
      variants: { orderBy: { heightPx: 'desc' } },
    },
  });
  if (!material || !material.fileKey) throw notFound('Material not available');
  if (material.section.module.organizationId !== session.organizationId) throw notFound();

  if (session.role === 'STUDENT') {
    if (material.status !== 'published') throw notFound('Material not available');
    // ACTIVE or COMPLETED enrollment in a course containing this module + access not expired
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        ...accessibleEnrollment(session.userId),
        course: { courseModules: { some: { moduleId: material.section.moduleId } } },
      },
      select: { id: true },
    });
    if (!enrollment) throw forbidden('Your access to this course has ended or you are not enrolled');
  } else if (session.role === 'INSTRUCTOR') {
    // instructors preview lessons of the courses they teach
    const mine = await taughtCourseIds(session.userId);
    const inMine = await prisma.courseModule.count({
      where: { moduleId: material.section.moduleId, courseId: { in: mine } },
    });
    if (!inMine) throw forbidden('You can only open lessons of courses you teach');
  }
  // Admins of the same organisation can preview everything (incl. hidden lessons)

  // Optional quality selection: ?variantId= — falls back to the original upload
  const variantId = req.nextUrl.searchParams.get('variantId');
  const chosen = variantId ? material.variants.find((v) => v.id === variantId) : null;
  const key = chosen?.fileKey ?? material.fileKey;

  const url = await getStorage().signedGetUrl(key, SIGNED_TTL_SEC);
  return NextResponse.json({
    url,
    expiresInSec: SIGNED_TTL_SEC,
    isDownloadable: material.isDownloadable, // player disables download when false
    durationSec: material.durationSec,
    activeVariantId: chosen?.id ?? null,
    variants: [
      { id: null, label: 'Original', heightPx: 9999 },
      ...material.variants.map((v) => ({ id: v.id, label: v.label, heightPx: v.heightPx })),
    ],
  });
});
