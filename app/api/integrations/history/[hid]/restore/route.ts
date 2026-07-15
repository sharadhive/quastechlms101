import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/rbac';
import { invalidateIntegrationCache } from '@/lib/integrations/store';
import { audit } from '@/lib/utils/audit';

/** Bring back an older configuration — it becomes the current one (as a new version). */
export const POST = withHandler(async (req: NextRequest, ctx: { params: { hid: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN']);
  const snap = await prisma.integrationHistory.findFirst({
    where: { id: ctx.params.hid, organizationId: session.organizationId },
  });
  if (!snap) throw notFound('History entry not found');

  await prisma.$transaction(async (tx) => {
    await tx.integration.update({
      where: { id: snap.integrationId },
      data: {
        name: snap.name, config: snap.config as any, secrets: snap.secrets,
        status: 'UNTESTED', lastError: null, version: { increment: 1 },
      },
    });
    await tx.integrationHistory.create({
      data: {
        integrationId: snap.integrationId, organizationId: snap.organizationId, provider: snap.provider,
        name: snap.name, config: snap.config as any, secrets: snap.secrets,
        action: 'RESTORED', note: `Restored the version saved on ${snap.changedAt.toLocaleString()}`,
        changedById: session.userId,
      },
    });
  });

  invalidateIntegrationCache(snap.provider);
  await prisma.$transaction((tx) =>
    audit(tx, {
      organizationId: session.organizationId, actorId: session.userId,
      action: 'integration.restore', entity: 'Integration', entityId: snap.integrationId,
      after: { restoredFrom: snap.changedAt },
    }),
  ).catch(() => {});
  return NextResponse.json({ ok: true });
});
