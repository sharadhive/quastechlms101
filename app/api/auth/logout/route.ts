import { NextResponse, type NextRequest } from 'next/server';
import { withHandler } from '@/lib/utils/errors';
import { getSession, clearAuthCookies, REFRESH_COOKIE } from '@/lib/auth/session';
import { revokeAllForUser, revokeFamilyOf } from '@/lib/auth/tokens';

/**
 * Logs out THIS device only — the same account stays signed in on the user's other phone/laptop.
 * POST /api/auth/logout?all=1 signs out every device instead.
 */
export const POST = withHandler(async (req: NextRequest) => {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (req.nextUrl.searchParams.get('all') === '1') {
    const session = await getSession(req);
    if (session) await revokeAllForUser(session.userId);
  }
  if (raw) await revokeFamilyOf(raw);
  return clearAuthCookies(NextResponse.json({ ok: true }));
});
