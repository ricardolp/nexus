import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth/constants';
import { getBackendUrl } from '@/lib/backend-url';

export async function getAccessTokenFromCookies(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

export async function backendFetch(path: string, init?: RequestInit) {
  const token = await getAccessTokenFromCookies();
  const headers = new Headers(init?.headers);

  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
