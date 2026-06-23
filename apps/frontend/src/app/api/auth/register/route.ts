import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/backend-url';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    nome?: string;
    sobrenome?: string;
    email?: string;
    senha?: string;
  };

  const backendResponse = await fetch(`${getBackendUrl()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await backendResponse.json().catch(() => ({}));

  if (!backendResponse.ok) {
    return NextResponse.json(
      { message: payload.message ?? 'Não foi possível criar a conta' },
      { status: backendResponse.status },
    );
  }

  return NextResponse.json({ success: true });
}
