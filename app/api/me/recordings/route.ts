import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';
import { accessibleEnrollment } from '@/lib/auth/enrollment';

/** Student: published class recordings of every batch they are in, newest first. */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const enrollments = await prisma.enrollment.findMany({
    where: { ...accessibleEnrollment(session.userId), batchId: { not: null } },
    select: { batchId: true },
  });
  const batchIds = enrollments.map((e) => e.batchId!).filter(Boolean);
  const recordings = await prisma.recording.findMany({
    where: { batchId: { in: batchIds }, status: 'published' },
    select: {
      id: true, title: true, createdAt: true, sessionId: true,
      batch: { select: { id: true, name: true, course: { select: { id: true, title: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ recordings });
});
