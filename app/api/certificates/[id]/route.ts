import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole, tenantScope, ADMIN_ROLES } from '@/lib/auth/rbac';
import { getStorage } from '@/lib/adapters/storage';
import { audit } from '@/lib/utils/audit';

async function load(req: NextRequest, id: string) {
  const session = await requireRole(req, ADMIN_ROLES);
  const scope = tenantScope(session);
  const cert = await prisma.certificate.findUnique({ where: { id } });
  if (!cert) throw notFound('Certificate not found');
  const enr = await prisma.enrollment.findFirst({
    where: { id: cert.enrollmentId, course: { organizationId: scope.organizationId } },
    select: { id: true },
  });
  if (!enr) throw notFound('Certificate not found');
  return { session, scope, cert };
}

/** GET → signed download link for admins. */
export const GET = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { cert } = await load(req, ctx.params.id);
  if (!cert.pdfKey) throw notFound('The certificate PDF is still being generated — try again in a minute');
  return NextResponse.json({ url: await getStorage().signedGetUrl(cert.pdfKey, 600) });
});

/** PATCH { revoked: true|false } — revoke (public verification shows "revoked") or restore. */
export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { session, scope, cert } = await load(req, ctx.params.id);
  const { revoked } = await parseBody(req, z.object({ revoked: z.boolean() }));
  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.certificate.update({
      where: { id: cert.id },
      data: { revokedAt: revoked ? new Date() : null },
    });
    await audit(tx, {
      organizationId: scope.organizationId, actorId: session.userId,
      action: revoked ? 'CERTIFICATE_REVOKE' : 'CERTIFICATE_RESTORE', entity: 'Certificate', entityId: cert.id,
    });
    return c;
  });
  return NextResponse.json({ certificate: updated });
});
