import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth/constants';
import { buildAuthCookieOptions } from '@/lib/auth/cookie-options';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/auth/sign-in?error=oauth', request.url));
  }

  const response = NextResponse.redirect(new URL('/dashboard/overview', request.url));
  const options = buildAuthCookieOptions(token, request);
  response.cookies.set(options.name, options.value, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: options.maxAge,
  });

  return response;
}
