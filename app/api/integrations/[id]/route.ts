import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler, notFound } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { encryptJson, decryptJson } from '@/lib/crypto';
import { getProvider, secretKeys } from '@/lib/integrations/registry';
import { invalidateIntegrationCache } from '@/lib/integrations/store';
import { audit } from '@/lib/utils/audit';

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  values: z.record(z.any()).optional(),  // only the fields being changed
  isActive: z.boolean().optional(),      // activate / deactivate
});

export const PATCH = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN']);
  const row = await prisma.integration.findFirst({
    where: { id: ctx.params.id, organizationId: session.organizationId },
  });
  if (!row) throw notFound('Integration not found');
  const body = await parseBody(req, patchSchema);
  const def = getProvider(row.provider);
  if (!def) throw notFound('Unknown provider');

  const sKeys = secretKeys(row.provider);
  const config: Record<string, unknown> = { ...(row.config as Record<string, unknown>) };
  let secrets: Record<string, unknown> = {};
  try { secrets = decryptJson(row.secrets); } catch { secrets = {}; }

  if (body.values) {
    for (const f of def.fields) {
      const v = body.values[f.key];
      if (v === undefined || v === '') continue;   // blank = keep the existing secret
      if (sKeys.includes(f.key)) secrets[f.key] = v; else config[f.key] = v;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (body.isActive === true)
      await tx.integration.updateMany({
        where: { organizationId: session.organizationId, provider: row.provider, id: { not: row.id } },
        data: { isActive: false },
      });
    const u = await tx.integration.update({
      where: { id: row.id },
      data: {
        name: body.name ?? row.name,
        config: config as any, secrets: encryptJson(secrets),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        version: { increment: 1 },
        ...(body.values ? { status: 'UNTESTED', lastError: null } : {}),
      },
    });
    await tx.integrationHistory.create({
      data: {
        integrationId: u.id, organizationId: session.organizationId, provider: u.provider, name: u.name,
        config: u.config as any, secrets: u.secrets,
        action: body.isActive === true ? 'ACTIVATED' : body.isActive === false ? 'DEACTIVATED' : 'UPDATED',
        changedById: session.userId,
      },
    });
    return u;
  });

  invalidateIntegrationCache(row.provider);
  await prisma.$transaction((tx) =>
    audit(tx, {
      organizationId: session.organizationId, actorId: session.userId,
      action: 'integration.update', entity: 'Integration', entityId: row.id,
      after: { name: updated.name, isActive: updated.isActive, version: updated.version },
    }),
  ).catch(() => {});
  return NextResponse.json({ ok: true, version: updated.version });
});

export const DELETE = withHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const session = await requireRole(req, ['SUPER_ADMIN']);
  const row = await prisma.integration.findFirst({
    where: { id: ctx.params.id, organizationId: session.organizationId },
  });
  if (!row) throw notFound('Integration not found');
  // history rows cascade — keep the audit trail by writing a final entry first
  await prisma.integrationHistory.create({
    data: {
      integrationId: row.id, organizationId: session.organizationId, provider: row.provider,
      name: row.name, config: row.config as any, secrets: row.secrets,
      action: 'DISABLED', changedById: session.userId,
    },
  });
  await prisma.integration.update({ where: { id: row.id }, data: { isActive: false } });
  invalidateIntegrationCache(row.provider);
  return NextResponse.json({ ok: true });
});
