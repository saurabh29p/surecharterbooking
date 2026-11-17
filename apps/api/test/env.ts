/** Environment for API tests. A real Postgres is required (docker compose or a local server). */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgres://shubhjets:shubhjets@localhost:5432/shubhjets_test',
  JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  DATA_ENCRYPTION_KEYS: `t1:${Buffer.alloc(32, 7).toString('base64')}`,
  COOKIE_SECURE: 'false',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: join(tmpdir(), 'shubhjets-test-files'),
};
