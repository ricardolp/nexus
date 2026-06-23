import { NextResponse } from 'next/server';
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME } from '@/lib/auth/constants';
import type { LoginResponse } from '@/lib/auth/types';
import { getServerBackendUrl } from '@/lib/backend-url';

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

  let backendResponse: Response;

  try {
    backendResponse = await fetch(`${getServerBackendUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: body.email, senha: body.senha }),
    });
  } catch (error) {
    console.error('Login proxy error:', error);

    return NextResponse.json(
      {
        message:
          'Não foi possível conectar ao backend. Verifique se ele está rodando e se API_URL aponta para a porta correta (ex.: http://127.0.0.1:4000).',
      },
      { status: 502 },
    );
  }

  const payload = await backendResponse.json().catch(() => ({}));

  if (!backendResponse.ok) {
    const message =
      backendResponse.status === 404
        ? 'Backend retornou 404 em /auth/login. Verifique se o NestJS está rodando na porta 4000 e se o nginx não encaminha /api/* direto para o backend.'
        : (payload.message ?? 'Credenciais inválidas');

    return NextResponse.json({ message }, { status: backendResponse.status });
  }

  const data = payload as LoginResponse;
  const response = NextResponse.json({ user: data.user });
  setAuthCookie(response, data.accessToken);
  return response;
}
