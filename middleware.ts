import { NextResponse, type NextRequest } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/session';

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const panel = Object.keys(PANEL_ROLES).find((p) => pathname.startsWith(p));
  if (!panel) return NextResponse.next();

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  let session = token ? await verifyAccessToken(token) : null;

  // If access token expired but refresh cookie exists, try a server-side refresh
  // so navigating between pages doesn't force a redirect to /login.
  if (!session) {
    const refreshCookie = req.cookies.get(REFRESH_COOKIE)?.value;
    if (refreshCookie) {
      try {
        const origin = req.nextUrl.origin;
        const refreshRes = await fetch(`${origin}/api/auth/refresh`, {
          method: 'POST',
          headers: { Cookie: `${REFRESH_COOKIE}=${refreshCookie}` },
        });
        if (refreshRes.ok) {
          // Extract the new cookies from the refresh response
          const setCookies = refreshRes.headers.getSetCookie?.() ?? [];
          // Read the new access token from the Set-Cookie header
          let newAccessToken: string | null = null;
          for (const sc of setCookies) {
            if (sc.startsWith(`${ACCESS_COOKIE}=`)) {
              newAccessToken = sc.split('=')[1]?.split(';')[0] ?? null;
            }
          }
          if (newAccessToken) {
            session = await verifyAccessToken(newAccessToken);
          }
          if (session) {
            // Let the page load and forward the refreshed cookies to the browser
            const res = NextResponse.next();
            for (const sc of setCookies) {
              res.headers.append('Set-Cookie', sc);
            }
            // Still check role access below
            if (!PANEL_ROLES[panel].includes(session.role)) {
              const url = req.nextUrl.clone();
              url.pathname = HOME[session.role] ?? '/login';
              return NextResponse.redirect(url);
            }
            return res;
          }
        }
      } catch {
        // Refresh failed — fall through to login redirect
      }
    }

    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (!PANEL_ROLES[panel].includes(session.role)) {
    // Wrong role → redirect to THEIR panel, never an error page (SRS Ch. 10)
    const url = req.nextUrl.clone();
    url.pathname = HOME[session.role] ?? '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/instructor/:path*', '/app/:path*'],
};
