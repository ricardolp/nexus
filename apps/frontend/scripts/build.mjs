process.env.NEXT_IGNORE_INCORRECT_LOCKFILE = 'true';

import { execSync } from 'node:child_process';

execSync('next build', { stdio: 'inherit', env: process.env });
