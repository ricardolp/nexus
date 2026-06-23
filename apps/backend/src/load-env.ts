import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({
  path: join(__dirname, '..', '.env'),
});
