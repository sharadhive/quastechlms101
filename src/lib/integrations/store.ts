import { prisma } from '@/lib/prisma';
import { decryptJson } from '@/lib/crypto';

interface Cached { at: number; value: Record<string, any> | null; }
const cache = new Map<string, Cached>();
const TTL = 30_000; // 30s — changes in the panel take effect almost immediately

/**
 * Returns the ACTIVE configuration for a provider (config + decrypted secrets),
 * or null when nothing is configured in the panel.
 */
export async function getActiveIntegration(provider: string, organizationId?: string): Promise<Record<string, any> | null> {
  const k = `${provider}:${organizationId ?? '*'}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const row = await prisma.integration.findFirst({
    where: { provider, isActive: true, ...(organizationId ? { organizationId } : {}) },
    orderBy: { updatedAt: 'desc' },
  });

  let value: Record<string, any> | null = null;
  if (row) {
    let secrets: Record<string, string> = {};
    try { secrets = decryptJson(row.secrets); } catch { secrets = {}; }
    value = { ...(row.config as Record<string, any>), ...secrets, __id: row.id, __name: row.name };
  }
  cache.set(k, { at: Date.now(), value });
  return value;
}

/** Called after any change so the next request picks up the new settings instantly. */
export function invalidateIntegrationCache(provider?: string) {
  if (!provider) cache.clear();
  else for (const k of [...cache.keys()]) if (k.startsWith(`${provider}:`)) cache.delete(k);
}

/** SMTP settings: panel configuration wins; .env is the fallback (so nothing breaks on day one). */
export async function getSmtpSettings() {
  const i = await getActiveIntegration('SMTP');
  if (i?.host && i?.user) {
    return {
      host: String(i.host), port: Number(i.port ?? 587),
      user: String(i.user), pass: String(i.pass ?? ''),
      from: String(i.from ?? i.user), source: `panel (${i.__name})`,
    };
  }
  return {
    host: process.env.SMTP_HOST ?? '', port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '', source: '.env file',
  };
}
