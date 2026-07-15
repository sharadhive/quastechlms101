import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';
import { decryptJson } from '@/lib/crypto';
import { testIntegration } from '@/lib/integrations/test';

/** Runs a real connection check. For SMTP a test email is sent to the Super Admin. */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN']);
  const row = await prisma.integration.findFirst({
    where: { id: ctx.params.id, organizationId: session.organizationId },
  });
  if (!row) throw notFound('Integration not found');

  let secrets: Record<string, string> = {};
  try { secrets = decryptJson(row.secrets); } catch { /* ignore */ }
  const cfg = { ...(row.config as Record<string, any>), ...secrets };

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  const result = await testIntegration(row.provider, cfg, me?.email);

  await prisma.integration.update({
    where: { id: row.id },
    data: { status: result.ok ? 'OK' : 'FAILED', lastTestedAt: new Date(), lastError: result.ok ? null : result.message },
  });
  return NextResponse.json(result);
});
