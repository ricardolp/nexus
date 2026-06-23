import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME } from './constants';

function isHttpsRequest(request?: Request | NextRequest): boolean {
  if (!request) {
    return false;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim() === 'https';
  }

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveAuthCookieSecure(request?: Request | NextRequest): boolean {
  if (process.env.AUTH_COOKIE_SECURE === 'true') {
    return true;
  }

  if (process.env.AUTH_COOKIE_SECURE === 'false') {
    return false;
  }

  return isHttpsRequest(request);
}

export function buildAuthCookieOptions(token: string, request?: Request | NextRequest) {
  return {
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: resolveAuthCookieSecure(request),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  };
}
