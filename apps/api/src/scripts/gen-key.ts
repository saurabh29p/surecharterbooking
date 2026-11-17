/** Prints a fresh value for DATA_ENCRYPTION_KEYS: `pnpm --filter @shubhjets/api gen:key`. */
import { randomBytes } from 'node:crypto';

const id = `k${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
console.log(`${id}:${randomBytes(32).toString('base64')}`);
