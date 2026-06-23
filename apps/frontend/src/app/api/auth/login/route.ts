import { NextResponse } from 'next/server';
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME } from '@/lib/auth/constants';
import type { LoginResponse } from '@/lib/auth/types';
import { getBackendUrl } from '@/lib/backend-url';

function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; senha?: string };

  if (!body.email || !body.senha) {
    return NextResponse.json({ message: 'E-mail e senha são obrigatórios' }, { status: 400 });
  }

  const backendResponse = await fetch(`${getBackendUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: body.email, senha: body.senha }),
  });

  const payload = await backendResponse.json().catch(() => ({}));

  if (!backendResponse.ok) {
    return NextResponse.json(
      { message: payload.message ?? 'Credenciais inválidas' },
      { status: backendResponse.status },
    );
  }

  const data = payload as LoginResponse;
  const response = NextResponse.json({ user: data.user });
  setAuthCookie(response, data.accessToken);
  return response;
}
