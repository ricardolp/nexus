const DEFAULT_BACKEND_URL = 'http://localhost:4000';

/**
 * Backend URL for server-side code (Route Handlers, Server Components).
 * Prefer API_URL in deploy — it is read at runtime and does not require a rebuild.
 */
export function getServerBackendUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    DEFAULT_BACKEND_URL
  );
}

/** @deprecated Use getServerBackendUrl in server code. */
export function getBackendUrl(): string {
  return getServerBackendUrl();
}
