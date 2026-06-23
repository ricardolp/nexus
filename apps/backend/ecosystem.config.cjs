/** @type {import('pm2').StartOptions[]} */
const apps = [
  {
    name: 'nexus-backend',
    script: 'dist/main.js',
    cwd: __dirname,
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
    name: 'nexus-backend-dev',
    script: 'npm',
    args: 'run dev',
    interpreter: 'none',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    env: {
      NODE_ENV: 'development',
      PORT: 4000,
    },
  },
];

module.exports = { apps };
