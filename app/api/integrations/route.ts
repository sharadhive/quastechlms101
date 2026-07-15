import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { parseBody } from '@/lib/utils/validate';
import { requireRole } from '@/lib/auth/rbac';
import { encryptJson, decryptJson, mask } from '@/lib/crypto';
import { PROVIDERS, getProvider, secretKeys } from '@/lib/integrations/registry';
import { invalidateIntegrationCache } from '@/lib/integrations/store';
import { audit } from '@/lib/utils/audit';

/** Catalogue + saved integrations. Secrets are NEVER returned — only masked previews. */
export const GET = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['SUPER_ADMIN']);
  const rows = await prisma.integration.findMany({
    where: { organizationId: session.organizationId },
    orderBy: [{ provider: 'asc' }, { updatedAt: 'desc' }],
  });

  const integrations = rows.map((r) => {
    let masked: Record<string, string> = {};
    try {
      const s = decryptJson(r.secrets);
      masked = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, mask(String(v))]));
    } catch { /* unreadable blob — key changed */ }
    return {
      id: r.id, provider: r.provider, name: r.name, config: r.config,
      maskedSecrets: masked, isActive: r.isActive, status: r.status,
      lastTestedAt: r.lastTestedAt, lastError: r.lastError, version: r.version,
      updatedAt: r.updatedAt,
    };
  });

  // env fallbacks shown so the owner can see what the system is using today
  const envFallback = {
    SMTP: process.env.SMTP_HOST ? { host: process.env.SMTP_HOST, user: process.env.SMTP_USER } : null,
    STORAGE_S3: process.env.S3_BUCKET ? { bucket: process.env.S3_BUCKET } : null,
    RAZORPAY: process.env.RAZORPAY_KEY_ID ? { keyId: mask(process.env.RAZORPAY_KEY_ID) } : null,
  };

  return NextResponse.json({ providers: PROVIDERS, integrations, envFallback });
});

const createSchema = z.object({
  provider: z.string().min(2),
  name: z.string().min(2),
  values: z.record(z.any()),
  activate: z.boolean().default(false),
});

export const POST = withHandler(async (req: NextRequest) => {
  const session = await requireRole(req, ['SUPER_ADMIN']);
  const { provider, name, values, activate } = await parseBody(req, createSchema);
  const def = getProvider(provider);
  if (!def) throw new Error('Unknown provider');

  const sKeys = secretKeys(provider);
  const config: Record<string, unknown> = {};
  const secrets: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = values[f.key];
    if (v === undefined || v === '') continue;
    if (sKeys.includes(f.key)) secrets[f.key] = v; else config[f.key] = v;
  }

  const created = await prisma.$transaction(async (tx) => {
    if (activate)
      await tx.integration.updateMany({
        where: { organizationId: session.organizationId, provider },
        data: { isActive: false },
      });
    const row = await tx.integration.create({
      data: {
        organizationId: session.organizationId, provider, name,
        config, secrets: encryptJson(secrets),
        isActive: activate, createdById: session.userId,
      },
    });
    await tx.integrationHistory.create({
      data: {
        integrationId: row.id, organizationId: session.organizationId, provider, name,
        config, secrets: row.secrets, action: activate ? 'ACTIVATED' : 'CREATED',
        changedById: session.userId,
      },
    });
    return row;
  });

  invalidateIntegrationCache(provider);
  await prisma.$transaction((tx) =>
    audit(tx, {
      organizationId: session.organizationId, actorId: session.userId,
      action: activate ? 'integration.activate' : 'integration.create',
      entity: 'Integration', entityId: created.id, after: { provider, name },
    }),
  ).catch(() => {});
  return NextResponse.json({ id: created.id }, { status: 201 });
});
