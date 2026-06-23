import { NextRequest, NextResponse } from 'next/server';
import { getAccessTokenFromCookies } from '@/lib/server-backend';
import { getServerBackendUrl } from '@/lib/backend-url';

async function readProxyBody(request: NextRequest): Promise<{
  body?: BodyInit;
  contentType?: string;
}> {
  if (['GET', 'HEAD'].includes(request.method)) {
    return {};
  }

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const forwarded = new FormData();

    for (const [key, value] of formData.entries()) {
      forwarded.append(key, value);
    }

    return { body: forwarded };
  }

  const buffer = await request.arrayBuffer();

  if (buffer.byteLength === 0) {
    return {};
  }

  return {
    body: buffer,
    contentType,
  };
}

async function proxy(request: NextRequest, path: string) {
  const token = await getAccessTokenFromCookies();

  if (!token) {
    return NextResponse.json({ message: 'Não autenticado' }, { status: 401 });
  }

  try {
    const targetUrl = `${getServerBackendUrl()}/${path}${request.nextUrl.search}`;
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);

    const { body, contentType } = await readProxyBody(request);

    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    const backendResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });

    const responseBody = await backendResponse.text();

    return new NextResponse(responseBody, {
      status: backendResponse.status,
      headers: {
        'Content-Type': backendResponse.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    console.error('Backend proxy error:', error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao comunicar com o servidor',
      },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path.join('/'));
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path.join('/'));
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path.join('/'));
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path.join('/'));
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path.join('/'));
}
