/**
 * Client-side fetch via the Next.js /api/backend proxy.
 * For server prefetch, use service.server.ts instead.
 */
export async function backendApiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return fetch(`/api/backend${normalizedPath}`, {
    ...init,
    cache: 'no-store',
  });
}
