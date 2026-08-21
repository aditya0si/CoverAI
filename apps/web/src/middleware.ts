import { NextResponse, NextRequest } from 'next/server';

/**
 * Decode a JWT payload without verifying the signature.
 * Used here only for routing decisions (redirect direction),
 * not for authentication — the backend still verifies the token.
 */
function decodeJwtPayload(token: string): { role?: string } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      Buffer.from(base64, 'base64')
        .toString('binary')
        .split('')
        .map((c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const refreshToken = request.cookies.get('refresh_token')?.value;
  const accessToken = request.cookies.get('access_token')?.value;
  const { pathname } = request.nextUrl;

  // Role comes from the server-issued access_token JWT, not a client-set cookie
  const jwtPayload = accessToken ? decodeJwtPayload(accessToken) : null;
  const role = jwtPayload?.role;

  // ── Auth page guard ──────────────────────────────────────────────────────
  const authPages = ['/login', '/register'];
  const isAuthPage = authPages.includes(pathname);

  if (isAuthPage && refreshToken) {
    const url = request.nextUrl.clone();
    if (role === 'advisor') {
      url.pathname = '/advisor/customers';
    } else if (role === 'insurer_officer') {
      url.pathname = '/insurer/dashboard';
    } else {
      url.pathname = '/dashboard';
    }
    return NextResponse.redirect(url);
  }

  // ── Protected route guard ────────────────────────────────────────────────
  const protectedPrefixes = ['/dashboard', '/policies', '/claims', '/insurer', '/advisor'];
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !refreshToken) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

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
