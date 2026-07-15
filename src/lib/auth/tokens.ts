import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);

const hash = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export async function issueRefreshToken(userId: string, familyId?: string) {
  const raw = crypto.randomBytes(32).toString('hex');
  const fam = familyId ?? crypto.randomUUID();
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId: fam,
      tokenHash: hash(raw),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 3600 * 1000),
    },
  });
  return { raw, familyId: fam, maxAgeSec: REFRESH_TTL_DAYS * 24 * 3600 };
}

/**
 * Rotate a refresh token. Returns the new raw token, or null if invalid.
 * Reuse LONG after rotation = theft indicator → the whole family is revoked.
 * Reuse within the grace window = a page refreshing several requests at once → allowed.
 */
export async function rotateRefreshToken(raw: string) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!row) return null;

  const now = new Date();
  if (row.revokedAt || row.expiresAt < now) return null;

  if (row.usedAt) {
    // A page can fire several API calls at once; when the access token has expired they
    // all refresh together with the SAME token. That is a benign race, not theft.
    const GRACE_MS = 30_000;
    if (now.getTime() - row.usedAt.getTime() < GRACE_MS) {
      const next = await issueRefreshToken(row.userId, row.familyId);
      return { ...next, userId: row.userId };
    }

    // Genuine replay → revoke entire family, force re-login everywhere
    await prisma.refreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    return null;
  }

  await prisma.refreshToken.update({ where: { id: row.id }, data: { usedAt: now } });
  const next = await issueRefreshToken(row.userId, row.familyId);
  return { ...next, userId: row.userId };
}

export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}