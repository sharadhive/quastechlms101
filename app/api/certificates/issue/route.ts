import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound, conflict } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { issueCertificate } from '@/lib/certificates';

const schema = z.object({ enrollmentId: z.string().min(1) });

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const { enrollmentId } = await parseBody(req, schema);

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, course: { organizationId: scope.organizationId } },
  });
  if (!enrollment) throw notFound('Enrollment not found');
  const existing = await prisma.certificate.findFirst({ where: { enrollmentId } });
  if (existing) throw conflict('Certificate already issued');

  const cert = await issueCertificate(enrollmentId);
  return NextResponse.json({ certificateId: cert.id, verifyCode: cert.verifyCode }, { status: 201 });
});

