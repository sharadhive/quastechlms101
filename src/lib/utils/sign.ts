import crypto from 'crypto';

const secret = () => process.env.JWT_SECRET!;

export function signPayload(payload: Record<string, unknown>, ttlSec: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSec * 1000 }))
    .toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** Returns the payload, or null for a tampered / malformed / expired token (never throws). */
export function verifyPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof payload?.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload as T;
  } catch {
    return null;
  }
}
