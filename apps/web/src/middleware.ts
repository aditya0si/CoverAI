import { NextResponse, NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware – authentication guard.
 *
 * Strategy:
 *  - Presence of the HttpOnly 'refresh_token' cookie = authenticated.
 *  - The 'user_role' cookie (set by the login client after /auth/login) is
 *    used for role-based redirect when visiting auth pages while logged in.
 *  - All protected portal prefixes require the refresh_token cookie.
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get('refresh_token');
  const roleCookie = request.cookies.get('user_role')?.value;
  const { pathname } = request.nextUrl;

  // ── Auth page guard ──────────────────────────────────────────────────────
  const authPages = ['/login', '/register'];
  const isAuthPage = authPages.includes(pathname);

  // Already authenticated → send to the correct role portal
  if (isAuthPage && token) {
    const url = request.nextUrl.clone();
    if (roleCookie === 'advisor') {
      url.pathname = '/advisor/customers';
    } else if (roleCookie === 'insurer_officer') {
      url.pathname = '/insurer/queue';
    } else {
      url.pathname = '/dashboard';
    }
    return NextResponse.redirect(url);
  }

  // ── Protected route guard ────────────────────────────────────────────────
  const protectedPrefixes = ['/dashboard', '/policies', '/claims', '/insurer', '/advisor'];
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !token) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Configure paths that should trigger this middleware.
 */
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/policies/:path*',
    '/claims/:path*',
    '/insurer/:path*',
    '/advisor/:path*',
    '/login',
    '/register',
  ],
};
