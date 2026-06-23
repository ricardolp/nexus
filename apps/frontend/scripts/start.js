#!/usr/bin/env node

// Next.js incorrectly detects missing @next/swc entries in npm workspace lockfiles
// when optional deps are nested under node_modules/next/node_modules/.
process.env.NEXT_IGNORE_INCORRECT_LOCKFILE = '1';

const { spawnSync } = require('child_process');

const result = spawnSync('next', ['start'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
