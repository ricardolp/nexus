import type { ApiProblem } from './api-types';

const API_URL = import.meta.env.VITE_API_URL
	?? import.meta.env.VITE_CONTROL_API_URL
	?? 'http://localhost:4000';

export function apiBaseUrl() {
  return API_URL;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(problem: ApiProblem) {
    super(problem.detail || problem.title);
    this.status = problem.status;
    this.code = problem.code;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  formData?: FormData;
  baseUrl?: string;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const bearer = options.token && options.token.split('.').length === 3 ? options.token : null;
  const headers: Record<string, string> = {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {})
  };
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${options.baseUrl ?? API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'include'
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (data && typeof data === 'object' && 'code' in data) {
      throw new ApiError(data as ApiProblem);
    }
    throw new ApiError({
      type: 'about:blank',
      title: 'Erro',
      status: res.status,
      code: 'unknown_error',
      detail: `Falha na requisição (${res.status})`,
      trace_id: ''
    });
  }

  return data as T;
}

// apiFetchBlob is for binary downloads (XML/ZIP) — apiFetch always parses
// the response as JSON, which would throw on a raw file body.
export async function apiFetchBlob(
  path: string,
  options: RequestOptions = {}
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${options.baseUrl ?? API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token && options.token.split('.').length === 3 ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'include'
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (data && typeof data === 'object' && 'code' in data) {
      throw new ApiError(data as ApiProblem);
    }
    throw new ApiError({
      type: 'about:blank',
      title: 'Erro',
      status: res.status,
      code: 'unknown_error',
      detail: `Falha no download (${res.status})`,
      trace_id: ''
    });
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? 'download';
  return { blob: await res.blob(), filename };
}

// triggerBlobDownload saves a Blob to the user's filesystem via a throwaway
// anchor element — the standard browser-side way to turn a fetched Blob into
// a "Save As" without navigating away from the page.
export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
