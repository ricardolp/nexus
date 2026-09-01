export type AppEnvironment = 'production' | 'homologation';

function normalizeEnv(value: string | undefined): AppEnvironment | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === 'production' || raw === 'prd' || raw === 'prod' || raw === 'producao' || raw === 'produção') {
    return 'production';
  }
  if (raw === 'homologation' || raw === 'homologacao' || raw === 'homologação' || raw === 'hml' || raw === 'staging') {
    return 'homologation';
  }
  return null;
}

/** VITE_APP_ENV / VITE_ENVIRONMENT — default homologation (safer). */
export function getAppEnvironment(): AppEnvironment {
  return (
    normalizeEnv(import.meta.env.VITE_APP_ENV) ??
    normalizeEnv(import.meta.env.VITE_ENVIRONMENT) ??
    'homologation'
  );
}

export function isProductionApp() {
  return getAppEnvironment() === 'production';
}

export function isHomologationApp() {
  return getAppEnvironment() === 'homologation';
}
