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

// Validate APP_URL once at startup. On cPanel/Passenger the req.nextUrl.origin is always the
// internal proxy address (e.g. http://127.0.0.1:3000), so APP_URL MUST be set to the real
// public URL or every redirect will send the browser to localhost.
const APP_URL = (() => {
  const raw = process.env.APP_URL?.replace(/\/+$/, ''); // trim trailing slash
  if (!raw && process.env.NODE_ENV === 'production') {
    console.warn('[middleware] ⚠ APP_URL is not set — redirects may point to localhost instead of the public domain!');
  }
  return raw || '';
})();

function redirect(req: NextRequest, pathname: string, withNext = false) {
  // ALWAYS prefer APP_URL. req.nextUrl.origin is the internal proxy address on cPanel/Passenger
  // (e.g. http://127.0.0.1:3000) and must never reach the browser.
  const base = APP_URL || req.nextUrl.origin;
  const url = new URL(pathname, base);
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

/** Already signed in and opening /login → go to their panel (or the page they were sent from). */
function toPanel(req: NextRequest, session: SessionPayload) {
  if (session.mustChangePassword) return redirect(req, '/change-password');
  const home = HOME[session.role] ?? '/';
  const next = req.nextUrl.searchParams.get('next') ?? '';
  return redirect(req, next === home || next.startsWith(home + '/') ? next : home);
}

// ───────────────────────── silent refresh ─────────────────────────
// The access cookie lives 15 min; the refresh cookie keeps the login alive (sliding, see tokens.ts).
// Whenever a request arrives without a valid access cookie but with a refresh cookie, the login is
// renewed right here — for page loads AND API calls (downloads, CSV export, video-progress beacons…)
// — so users are never bounced to the login page while their login is still valid.

type Refresh =
  | { kind: 'ok'; session: SessionPayload; access: string; refresh: string | null; setCookies: string[] }
  | { kind: 'expired'; setCookies: string[] } // login really ended (logged out, revoked, 30+ days unused)
  | { kind: 'unavailable' }; // server restarting / busy / network — never log anyone out for this

function setCookiesOf(h: Headers): string[] {
  const list = (h as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (list) return list;
  const joined = h.get('set-cookie');
  return joined ? joined.split(/,(?=\s*[^;,=\s]+=)/).map((s) => s.trim()) : [];
}

function cookieFrom(setCookies: string[], name: string): string | null {
  const sc = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!sc) return null;
  const v = decodeURIComponent(sc.slice(name.length + 1).split(';')[0]);
  return v || null;
}

/**
 * Where the server can reach its own /api/auth/refresh: its internal address first; if that address
 * can't be reached (cPanel/Passenger, some proxies), the public APP_URL from the settings.
 */
function refreshUrls(req: NextRequest): string[] {
  const urls = [new URL('/api/auth/refresh', req.nextUrl.origin).toString()];
  try {
    if (process.env.APP_URL) urls.push(new URL('/api/auth/refresh', process.env.APP_URL).toString());
  } catch { /* APP_URL not a valid URL — ignore */ }
  return [...new Set(urls)];
}

async function postRefresh(req: NextRequest, raw: string): Promise<Response> {
  let lastErr: unknown;
  for (const url of refreshUrls(req)) {
    try {
      return await fetch(url, { method: 'POST', headers: { Cookie: `${REFRESH_COOKIE}=${raw}` } });
    } catch (e) {
      lastErr = e; // address not reachable → try the next one
    }
  }
  throw lastErr;
}

async function refresh(req: NextRequest): Promise<Refresh> {
  const raw = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) return { kind: 'expired', setCookies: [] };
  try {
    const r = await postRefresh(req, raw);
    const setCookies = setCookiesOf(r.headers);
    if (r.status === 401 || r.status === 403) return { kind: 'expired', setCookies };
    if (!r.ok) return { kind: 'unavailable' };
    const access = cookieFrom(setCookies, ACCESS_COOKIE);
    const session = access ? await verifyAccessToken(access) : null;
    if (!access || !session) return { kind: 'unavailable' };
    return { kind: 'ok', session, access, refresh: cookieFrom(setCookies, REFRESH_COOKIE), setCookies };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Request headers with the fresh cookies, so the page / API route handling THIS request is signed in. */
function freshRequestHeaders(req: NextRequest, access: string, refreshRaw: string | null) {
  const headers = new Headers(req.headers);
  const others = (req.headers.get('cookie') ?? '')
    .split(/;\s*/)
    .filter((p) => p && !p.startsWith(`${ACCESS_COOKIE}=`) && !p.startsWith(`${REFRESH_COOKIE}=`));
  others.push(`${ACCESS_COOKIE}=${access}`);
  if (refreshRaw) others.push(`${REFRESH_COOKIE}=${refreshRaw}`);
  headers.set('cookie', others.join('; '));
  return headers;
}

/** Pass the refresh endpoint's Set-Cookie headers on to the browser. */
function withCookies(res: NextResponse, setCookies: string[]) {
  for (const sc of setCookies) res.headers.append('Set-Cookie', sc);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const session = token ? await verifyAccessToken(token) : null;
  const canRefresh = !!req.cookies.get(REFRESH_COOKIE)?.value;

  // ── API calls: renew silently; the route itself still decides who may do what ──
  if (pathname.startsWith('/api/')) {
    if (session || !canRefresh) return NextResponse.next();
    const r = await refresh(req);
    if (r.kind === 'ok')
      return withCookies(NextResponse.next({ request: { headers: freshRequestHeaders(req, r.access, r.refresh) } }), r.setCookies);
    if (r.kind === 'expired') return withCookies(NextResponse.next(), r.setCookies); // clears the dead cookies
    return NextResponse.next();
  }

  // ── Login page: still signed in → straight back to the panel ──
  if (pathname === '/login') {
    if (req.nextUrl.searchParams.has('expired')) return NextResponse.next();
    if (session) return toPanel(req, session);
    if (!canRefresh) return NextResponse.next();
    const r = await refresh(req);
    if (r.kind === 'ok') return withCookies(toPanel(req, r.session), r.setCookies);
    if (r.kind === 'expired') return withCookies(NextResponse.next(), r.setCookies);
    return NextResponse.next();
  }

  // ── Panels ──
  const panel = Object.keys(PANEL_ROLES).find((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!panel) return NextResponse.next();
  if (session) return gate(req, panel, session, NextResponse.next());

  if (canRefresh) {
    const r = await refresh(req);
    if (r.kind === 'ok') {
      const res = gate(req, panel, r.session,
        NextResponse.next({ request: { headers: freshRequestHeaders(req, r.access, r.refresh) } }));
      return withCookies(res, r.setCookies);
    }
    // Server restarting / slow: let the page open — it signs itself in again as soon as the server answers
    if (r.kind === 'unavailable') return NextResponse.next();
    return withCookies(redirect(req, '/login', true), r.setCookies);
  }
  return redirect(req, '/login', true);
}

export const config = {
  matcher: [
    '/admin/:path*', '/instructor/:path*', '/app/:path*', '/admin', '/instructor', '/app', '/login',
    // every API call — except the sign-in endpoints themselves and the token-signed video/file/upload links
    '/api/((?!auth/refresh|auth/login|auth/logout|auth/otp|auth/register|auth/password|stream/|uploads/local/|payments/callback|cron/|health).*)',
  ],
};
