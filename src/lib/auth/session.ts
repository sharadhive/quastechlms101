import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Role } from '@prisma/client';
import { verifyAccessToken, signAccessToken, type SessionPayload } from './jwt';
import { issueRefreshToken } from './tokens';
import { unauthorized } from '@/lib/utils/errors';

import { ACCESS_COOKIE, REFRESH_COOKIE } from './cookies';
export { ACCESS_COOKIE, REFRESH_COOKIE };

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
    path: '/', // must be '/' so the middleware can read it for server-side refresh
  });
  return res;
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { ...base, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { ...base, maxAge: 0, path: '/' });
  return res;
}

/** Log a user in: new access + refresh token, cookies set, standard JSON body. */
export async function startSession(
  user: { id: string; role: Role; organizationId: string; branchId: string | null; name: string; mustChangePassword: boolean },
  status = 200,
) {
  const access = await signAccessToken({
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
    branchId: user.branchId,
    mustChangePassword: user.mustChangePassword,
  });
  const refresh = await issueRefreshToken(user.id);
  const res = NextResponse.json(
    { role: user.role, name: user.name, mustChangePassword: user.mustChangePassword },
    { status },
  );
  return setAuthCookies(res, access, refresh.raw, refresh.maxAgeSec);
}
