import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';
import { getStorage } from '@/lib/adapters/storage';

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
  if (!material || !material.fileKey || material.status !== 'published')
    throw notFound('Material not available');
  if (material.section.module.organizationId !== session.organizationId) throw notFound();

  if (session.role === 'STUDENT') {
    // valid session + ACTIVE enrollment in a course containing this module + access not expired
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        learnerId: session.userId,
        status: 'ACTIVE',
        OR: [{ accessExpiry: null }, { accessExpiry: { gt: new Date() } }],
        course: { courseModules: { some: { moduleId: material.section.moduleId } } },
      },
      select: { id: true },
    });
    if (!enrollment) throw forbidden('Not enrolled in this course');
  }
  // ADMIN/BRANCH_ADMIN/SUPER_ADMIN/INSTRUCTOR of same org pass through

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
