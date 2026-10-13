import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler } from '@/lib/utils/errors';
import { rotateRefreshToken } from '@/lib/auth/tokens';
import { signAccessToken } from '@/lib/auth/jwt';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '@/lib/auth/session';

/** 401 + cookies cleared: the browser drops the dead login, so /login shows the form instead of looping. */
const ended = () => clearAuthCookies(NextResponse.json({ error: 'Session expired' }, { status: 401 }));

export const POST = withHandler(async (req: NextRequest) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) return ended();

  const rotated = await rotateRefreshToken(raw);
  if (!rotated) return ended();

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user || !user.isActive) return ended();

  const access = await signAccessToken({
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
    branchId: user.branchId,
    mustChangePassword: user.mustChangePassword,
  });

  const res = NextResponse.json({ ok: true });
  return setAuthCookies(res, access, rotated.raw, rotated.maxAgeSec);
});
