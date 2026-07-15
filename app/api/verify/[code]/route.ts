import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';

/** PUBLIC certificate verification — QR on the PDF points here (SRS 12.11). */
export const GET = withHandler(async (_req: NextRequest, ctx: { params: { code: string } }) => {
  const cert = await prisma.certificate.findUnique({
    where: { verifyCode: ctx.params.code.toUpperCase() },
  });
  if (!cert) return NextResponse.json({ valid: false }, { status: 404 });

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: cert.enrollmentId },
    select: {
      learner: { select: { name: true } },
      course: { select: { title: true } },
    },
  });

  return NextResponse.json({
    valid: !cert.revokedAt,
    revoked: !!cert.revokedAt,
    learnerName: enrollment?.learner.name,
    courseTitle: enrollment?.course.title,
    issuedAt: cert.issuedAt,
  });
});
