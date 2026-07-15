import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyAccessToken, type SessionPayload } from './jwt';
import { unauthorized } from '@/lib/utils/errors';

export const ACCESS_COOKIE = 'qs_access';
export const REFRESH_COOKIE = 'qs_refresh';

export async function getSession(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function requireSession(req: NextRequest): Promise<SessionPayload> {
  const s = await getSession(req);
  if (!s) throw unauthorized();
  return s;
}

const isProd = process.env.NODE_ENV === 'production';
const base = { httpOnly: true, secure: isProd, sameSite: 'lax' as const, path: '/' };

export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshRaw: string,
  refreshMaxAgeSec: number,
) {
  const accessTtlMin = Number(process.env.ACCESS_TOKEN_TTL_MIN ?? 15);
  res.cookies.set(ACCESS_COOKIE, accessToken, { ...base, maxAge: accessTtlMin * 60 });
  res.cookies.set(REFRESH_COOKIE, refreshRaw, {
    ...base,
    maxAge: refreshMaxAgeSec,
    path: '/api/auth', // refresh cookie only travels to auth endpoints
  });
  return res;
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { ...base, maxAge: 0, path: '/api/auth' });
  return res;
}
