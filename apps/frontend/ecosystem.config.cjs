/** @type {import('pm2').StartOptions[]} */
const sharedEnv = {
  PORT: 3000,
  API_URL: 'http://127.0.0.1:4000',
  NEXT_PUBLIC_SENTRY_DISABLED: 'true',
  NEXT_IGNORE_INCORRECT_LOCKFILE: '1',
};

/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    name: 'nexus-frontend',
    script: 'scripts/start.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      ...sharedEnv,
      NODE_ENV: 'production',
    },
  },
  {
    name: 'nexus-frontend-dev',
    script: 'npm',
    args: 'run dev',
    interpreter: 'none',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      ...sharedEnv,
      NODE_ENV: 'development',
    },
  },
];

module.exports = { apps };
