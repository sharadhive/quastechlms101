import { NextResponse, type NextRequest } from 'next/server';
import { withHandler } from '@/lib/utils/errors';
import { getSession, clearAuthCookies } from '@/lib/auth/session';
import { revokeAllForUser } from '@/lib/auth/tokens';

export const POST = withHandler(async (req: NextRequest) => {
  const session = await getSession(req);
  if (session) await revokeAllForUser(session.userId); // revoke-all-devices
  return clearAuthCookies(NextResponse.json({ ok: true }));
});

