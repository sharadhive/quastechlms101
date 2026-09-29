import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withHandler, unauthorized } from '@/lib/utils/errors';
import { rotateRefreshToken } from '@/lib/auth/tokens';
import { signAccessToken } from '@/lib/auth/jwt';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '@/lib/auth/session';

export const POST = withHandler(async (req: NextRequest) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) throw unauthorized();

  const rotated = await rotateRefreshToken(raw);
  if (!rotated) {
    const res = NextResponse.json({ error: 'Session expired' }, { status: 401 });
    return clearAuthCookies(res);
  }

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user || !user.isActive) throw unauthorized();

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

