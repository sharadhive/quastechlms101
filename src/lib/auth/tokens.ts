import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * Sliding session: every refresh issues a NEW token valid for this many days, so a user who opens the
 * app at least once in this period is never logged out. Set REFRESH_TOKEN_TTL_DAYS to change it.
 */
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
 * A "family" = one login on one device; every refresh adds a newer token to it.
 *
 * An already-used token coming back:
 *  • within 30 s → several requests refreshed at the same moment → allowed
 *  • later, but no newer token of this login was ever used → the browser never received the new cookie
 *    (tab closed mid-request, phone lost signal, laptop slept). Same device → continue the session.
 *  • later, and a newer token WAS used → two copies of the session exist = stolen cookie → the whole
 *    login is revoked and must sign in again.
 */
export async function rotateRefreshToken(raw: string) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!row) return null;

  const now = new Date();
  if (row.revokedAt || row.expiresAt < now) return null;

  if (row.usedAt) {
    const GRACE_MS = 30_000;
    if (now.getTime() - row.usedAt.getTime() >= GRACE_MS) {
      const newer = { familyId: row.familyId, createdAt: { gt: row.createdAt } };
      const continued = await prisma.refreshToken.count({ where: { ...newer, usedAt: { not: null } } });
      if (continued > 0) {
        // Genuine replay → revoke entire family, force re-login on that device
        await prisma.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        return null;
      }
      // Lost response: retire the never-delivered tokens so only one live token remains
      await prisma.refreshToken.updateMany({ where: { ...newer, revokedAt: null }, data: { revokedAt: now } });
    }
    const next = await issueRefreshToken(row.userId, row.familyId);
    return { ...next, userId: row.userId };
  }

  await prisma.refreshToken.update({ where: { id: row.id }, data: { usedAt: now } });
  const next = await issueRefreshToken(row.userId, row.familyId);
  return { ...next, userId: row.userId };
}

/** Sign out ONE device: revoke the login (family) this refresh token belongs to. */
export async function revokeFamilyOf(raw: string) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(raw) }, select: { familyId: true } });
  if (!row) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: row.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Sign out EVERY device (password change/reset, account deactivated, "log out everywhere"). */
export async function revokeAllForUser(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Housekeeping (hourly, from the in-app job runner): every refresh adds a row, so drop rows that can
 * never be used again — expired ones, and used/revoked ones older than 2 days.
 */
export async function pruneRefreshTokens() {
  const cutoff = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  const { count } = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { lt: cutoff } },
        { usedAt: { lt: cutoff } },
      ],
    },
  });
  return count;
}
