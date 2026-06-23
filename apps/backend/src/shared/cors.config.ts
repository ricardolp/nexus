import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectExplicitOrigins(): Set<string> {
  const origins = new Set<string>();

  for (const origin of parseList(process.env.CORS_ORIGINS)) {
    origins.add(origin);
  }

  for (const key of ['APP_URL', 'FRONTEND_URL']) {
    const url = process.env[key]?.trim();
    if (url) {
      origins.add(url);
    }
  }

  return origins;
}

function isAllowedByHostAndPort(origin: string): boolean {
  const hosts = parseList(process.env.CORS_HOSTS ?? 'localhost,127.0.0.1');
  const ports = parseList(process.env.CORS_PORTS ?? '3000,3001,5173');

  if (hosts.length === 0 || ports.length === 0) {
    return false;
  }

  try {
    const url = new URL(origin);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return hosts.includes(url.hostname) && ports.includes(port);
  } catch {
    return false;
  }
}

export function resolveCorsOptions(): CorsOptions {
  const explicitOrigins = collectExplicitOrigins();

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (explicitOrigins.has(origin) || isAllowedByHostAndPort(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
  };
}
