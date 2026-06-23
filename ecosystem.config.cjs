const path = require('path');

const root = __dirname;
const backendDir = path.join(root, 'apps/backend');
const frontendDir = path.join(root, 'apps/frontend');

const frontendEnv = {
  PORT: 3000,
  API_URL: 'http://127.0.0.1:4000',
  NEXT_PUBLIC_SENTRY_DISABLED: 'true',
  NEXT_IGNORE_INCORRECT_LOCKFILE: '1',
};

/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    name: 'nexus-backend',
    script: 'dist/main.js',
    cwd: backendDir,
    instances: 1,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
      PORT: 4000,
    },
  },
  {
    name: 'nexus-frontend',
    script: 'scripts/start.js',
    cwd: frontendDir,
    instances: 1,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      ...frontendEnv,
      NODE_ENV: 'production',
    },
  },
  {
    name: 'nexus-backend-dev',
    script: 'npm',
    args: 'run dev',
    interpreter: 'none',
    cwd: backendDir,
    instances: 1,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      NODE_ENV: 'development',
      PORT: 4000,
    },
  },
  {
    name: 'nexus-frontend-dev',
    script: 'npm',
    args: 'run dev',
    interpreter: 'none',
    cwd: frontendDir,
    instances: 1,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      ...frontendEnv,
      NODE_ENV: 'development',
    },
  },
];

module.exports = { apps };
