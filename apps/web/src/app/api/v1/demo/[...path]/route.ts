import { NextRequest } from 'next/server';

/**
 * Allowlisted same-origin proxy from the browser to the standalone demo API.
 *
 * It forwards only the demo capability cookie, Content-Type, X-Demo-CSRF,
 * Idempotency-Key and a validated Origin. Production cookies, Authorization
 * headers and arbitrary paths are never forwarded.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_ORIGIN_DEFAULT = 'http://127.0.0.1:8001';
const WEB_ORIGIN = process.env.DEMO_WEB_ORIGIN || 'http://localhost:3000';
const SESSION_COOKIE = 'coverai_demo_session';
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value
  );
}

function matchRoute(method: string, segments: string[]): boolean {
  const path = segments.join('/');
  if (path === 'session') return method === 'POST' || method === 'GET' || method === 'DELETE';
  if (path === 'policies') return method === 'POST';
  if (path === 'explanations') return method === 'POST';
  if (path === 'handoffs') return method === 'POST';
  if (segments.length === 4 && segments[0] === 'policies' && segments[2] === 'pages') {
    return method === 'GET' && isUuid(segments[1]) && /^[0-9]+$/.test(segments[3]);
  }
  if (segments.length === 2 && segments[0] === 'explanations') {
    return method === 'GET' && isUuid(segments[1]);
  }
  if (segments.length === 2 && segments[0] === 'inboxes') {
    return method === 'GET' && (segments[1] === 'mechanic' || segments[1] === 'officer');
  }
  return false;
}

function resolveOrigin(): string {
  // The upstream is fixed at build/start time from a server-only env var. It is
  // never selectable from a request header, so a production deployment cannot be
  // redirected to an attacker-chosen origin at runtime.
  return process.env.DEMO_API_ORIGIN || DEMO_ORIGIN_DEFAULT;
}

const SAFE_RETRY_AFTER = /^[0-9]{1,6}$/;

/**
 * Only a bounded delta-seconds Retry-After is forwarded. An arbitrary upstream
 * value (or one that could be reflected as a header) is dropped entirely.
 */
function safeRetryAfter(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return SAFE_RETRY_AFTER.test(trimmed) ? trimmed : null;
}

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: code, request_id: 'proxy' } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Cookie' },
  });
}

async function handle(request: NextRequest, method: string): Promise<Response> {
  const segments = request.nextUrl.pathname
    .replace(/^\/api\/v1\/demo\/?/, '')
    .split('/')
    .filter((segment) => segment.length > 0);

  if (segments.some((segment) => !SAFE_SEGMENT.test(segment) || segment === '..')) {
    return errorResponse(404, 'NOT_FOUND');
  }
  if (!matchRoute(method, segments)) {
    return errorResponse(method === 'POST' || method === 'GET' || method === 'DELETE' ? 404 : 405, 'NOT_FOUND');
  }

  const origin = request.headers.get('origin');
  const mutating = method === 'POST' || method === 'DELETE';
  if (mutating) {
    if (!origin || origin !== WEB_ORIGIN) {
      return errorResponse(403, 'FORBIDDEN');
    }
  } else if (origin && origin !== WEB_ORIGIN) {
    return errorResponse(403, 'FORBIDDEN');
  }

  const forwarded = new Headers();
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) forwarded.set('cookie', `${SESSION_COOKIE}=${cookie}`);
  for (const name of ['content-type', 'x-demo-csrf', 'idempotency-key']) {
    const value = request.headers.get(name);
    if (value) forwarded.set(name, value);
  }
  if (origin) forwarded.set('origin', origin);

  const target = `${resolveOrigin()}/api/v1/demo/${segments.join('/')}`;
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: forwarded,
    redirect: 'manual',
  };
  if (mutating) {
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return errorResponse(502, 'BAD_GATEWAY');
  }

  const headers = new Headers();
  headers.set('cache-control', 'no-store');
  headers.set('vary', 'Cookie');
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const requestId = upstream.headers.get('x-request-id');
  if (requestId) headers.set('x-request-id', requestId);
  const retryAfter = safeRetryAfter(upstream.headers.get('retry-after'));
  if (retryAfter !== null) headers.set('retry-after', retryAfter);

  const setCookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : [upstream.headers.get('set-cookie')].filter((value): value is string => Boolean(value));
  for (const value of setCookies) {
    if (value.startsWith(`${SESSION_COOKIE}=`)) {
      headers.append('set-cookie', value);
    }
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request, 'GET');
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request, 'POST');
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return handle(request, 'DELETE');
}

export async function PUT(): Promise<Response> {
  return errorResponse(405, 'METHOD_NOT_ALLOWED');
}
