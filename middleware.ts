import { NextResponse, type NextRequest } from 'next/server';
import { verifyAccessToken, type SessionPayload } from '@/lib/auth/jwt';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies';

const PANEL_ROLES: Record<string, string[]> = {
  '/admin': ['SUPER_ADMIN', 'ADMIN', 'BRANCH_ADMIN'],
  '/instructor': ['INSTRUCTOR'],
  '/app': ['STUDENT'],
};

const HOME: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  ADMIN: '/admin',
  BRANCH_ADMIN: '/admin',
  INSTRUCTOR: '/instructor',
  STUDENT: '/app',
};

function redirect(req: NextRequest, pathname: string, withNext = false) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  if (withNext) url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

/** Decide what a signed-in user may see for this panel. */
function gate(req: NextRequest, panel: string, session: SessionPayload, res: NextResponse) {
  // Temporary password → must set a new one before using any panel
  if (session.mustChangePassword) return redirect(req, '/change-password');
  // Wrong role → redirect to THEIR panel, never an error page (SRS Ch. 10)
  if (!PANEL_ROLES[panel].includes(session.role)) return redirect(req, HOME[session.role] ?? '/login');
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const panel = Object.keys(PANEL_ROLES).find((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!panel) return NextResponse.next();

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const session = token ? await verifyAccessToken(token) : null;
  if (session) return gate(req, panel, session, NextResponse.next());

  // Access token expired but refresh cookie exists → refresh server-side so navigating
  // between pages doesn't bounce the user to /login.
  const refreshCookie = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshCookie) {
    try {
      const refreshRes = await fetch(`${req.nextUrl.origin}/api/auth/refresh`, {
        method: 'POST',
        headers: { Cookie: `${REFRESH_COOKIE}=${refreshCookie}` },
      });
      if (refreshRes.ok) {
        const setCookies = refreshRes.headers.getSetCookie?.() ?? [];
        let newAccessToken: string | null = null;
        for (const sc of setCookies) {
          if (sc.startsWith(`${ACCESS_COOKIE}=`)) newAccessToken = sc.split('=')[1]?.split(';')[0] ?? null;
        }
        const refreshed = newAccessToken ? await verifyAccessToken(newAccessToken) : null;
        if (refreshed) {
          const res = gate(req, panel, refreshed, NextResponse.next());
          for (const sc of setCookies) res.headers.append('Set-Cookie', sc);
          return res;
        }
      }
    } catch {
      // Refresh failed — fall through to login redirect
    }
  }
  return redirect(req, '/login', true);
}

export const config = {
  matcher: ['/admin/:path*', '/instructor/:path*', '/app/:path*', '/admin', '/instructor', '/app'],
};
