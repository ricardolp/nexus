import { NextResponse } from 'next/server';
import { getServerBackendUrl } from '@/lib/backend-url';

export async function GET() {
  const apiUrl = getServerBackendUrl();

  let backend: { ok: boolean; status?: number; error?: string } = { ok: false };

  try {
    const response = await fetch(`${apiUrl}/auth/`, { cache: 'no-store' });
    backend = { ok: response.ok, status: response.status };
  } catch (error) {
    backend = {
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao conectar',
    };
  }

  return NextResponse.json({
    frontend: 'ok',
    apiUrl,
    backend,
    hint:
      'O navegador sempre chama /api/* na porta do frontend. O Next.js repassa para API_URL no servidor.',
  });
}
