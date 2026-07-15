import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';

export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['STUDENT']);
  const enrollments = await prisma.enrollment.findMany({
    where: { learnerId: session.userId },
    select: { id: true, course: { select: { title: true } } },
  });
  const byId = new Map(enrollments.map((e) => [e.id, e.course.title]));

  const certs = await prisma.certificate.findMany({
    where: { enrollmentId: { in: [...byId.keys()] }, revokedAt: null },
    orderBy: { issuedAt: 'desc' },
  });

  const storage = getStorage();
  const certificates = await Promise.all(
    certs.map(async (c) => ({
      id: c.id,
      courseTitle: byId.get(c.enrollmentId) ?? '',
      verifyCode: c.verifyCode,
      issuedAt: c.issuedAt,
      downloadUrl: c.pdfKey ? await storage.signedGetUrl(c.pdfKey, 3600) : null, // null while rendering
    })),
  );
  return NextResponse.json({ certificates });
});

