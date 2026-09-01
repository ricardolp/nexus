const SKIP_KEY = (userId: string) => `nexus-mfa-onboarding-skipped:${userId}`;

export function hasSkippedMfaOnboarding(userId: string) {
  try {
    return localStorage.getItem(SKIP_KEY(userId)) === '1';
  } catch {
    return false;
  }
}

export function markMfaOnboardingSkipped(userId: string) {
  try {
    localStorage.setItem(SKIP_KEY(userId), '1');
  } catch {
    /* ignore */
  }
}

export function markMfaOnboardingDone(userId: string) {
  try {
    localStorage.setItem(SKIP_KEY(userId), '1');
  } catch {
    /* ignore */
  }
}

/** After password login: MFA challenge, forced/optional onboarding, or the app. */
export function postLoginPath(opts: {
  result: 'ok' | 'mfa' | 'mfa_setup';
  role: 'admin' | 'user';
  mfaEnabled?: boolean;
  userId?: string;
  mfaSetupRequired?: boolean;
}) {
  if (opts.result === 'mfa') {
    return opts.role === 'admin' ? '/admin/login' : '/login';
  }
  const home = opts.role === 'admin' ? '/admin/overview' : '/app/overview';
  const setup = '/mfa-setup';
  if (opts.result === 'mfa_setup' || opts.mfaSetupRequired) {
    return setup;
  }
  if (!opts.mfaEnabled && opts.userId && !hasSkippedMfaOnboarding(opts.userId)) {
    return setup;
  }
  return home;
}
