import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, forbidden } from '@/lib/utils/errors';
import { requireSession } from '@/lib/auth/session';
import { accessibleEnrollment } from '@/lib/auth/enrollment';
import { getStorage } from '@/lib/adapters/storage';

/** Signed playback URL for a class recording (students: must be in that batch). */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireSession(req);
  const rec = await prisma.recording.findFirst({
    where: { id: ctx.params.id, batch: { course: { organizationId: session.organizationId } } },
    include: { batch: { select: { instructorId: true, branchId: true } } },
  });
  if (!rec) throw notFound('Recording not found');

  if (session.role === 'STUDENT') {
    if (rec.status !== 'published') throw notFound('Recording not available');
    const inBatch = await prisma.enrollment.findFirst({
      where: { ...accessibleEnrollment(session.userId), batchId: rec.batchId },
      select: { id: true },
    });
    if (!inBatch) throw forbidden('This recording belongs to a batch you are not in');
  } else if (session.role === 'INSTRUCTOR' && rec.batch.instructorId !== session.userId) {
    throw forbidden();
  } else if (session.role === 'BRANCH_ADMIN' && session.branchId && rec.batch.branchId !== session.branchId) {
    throw forbidden();
  }

  const url = await getStorage().signedGetUrl(rec.fileKey, 4 * 3600);
  return NextResponse.json({ url, title: rec.title });
});
