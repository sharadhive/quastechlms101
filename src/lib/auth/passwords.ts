import crypto from 'crypto';
import { Prisma } from '@prisma/client';

/** Readable temporary password, e.g. "Qs-7kP2mX9aR" (never stored in plain text). */
export function generateTempPassword(): string {
  return `Qs-${crypto.randomBytes(7).toString('base64url').slice(0, 9)}`;
}

/**
 * Older versions kept `tempPassword` inside the profile JSON. Remove it wherever a profile
 * is written or returned so plain-text passwords never reach the database or the UI again.
 */
export function stripTempPassword(profile: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return Prisma.DbNull;
  const { tempPassword: _drop, ...rest } = profile as Record<string, unknown>;
  return rest as Prisma.InputJsonValue;
}

/** Same as above for API responses. */
export function publicProfile(profile: unknown): Record<string, unknown> | null {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const { tempPassword: _drop, ...rest } = profile as Record<string, unknown>;
  return rest;
}
