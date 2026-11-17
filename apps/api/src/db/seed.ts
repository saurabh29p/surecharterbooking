/**
 * `pnpm seed`: wipes the development database and fills it with fake data (BRIEF.md §8).
 * Refuses in production, and on any database that holds real (non-demo) accounts unless --force.
 */
import 'reflect-metadata';
import { loadConfig } from '../config.js';
import { EncryptionService } from '../crypto/encryption.service.js';
import { makeDataSource } from './data-source.js';
import { assertSeedAllowed, seed } from './seed-data.js';

const config = loadConfig();
const ds = makeDataSource(config.DATABASE_URL, config.DATABASE_SSL);
await ds.initialize();
try {
  await assertSeedAllowed(ds, config, { force: process.argv.includes('--force') });
  await ds.runMigrations({ transaction: 'each' });
  const summary = await seed(ds, new EncryptionService(config));
  console.log(
    'Seeded fake data:',
    Object.entries(summary.counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', '),
  );
  console.log(
    `Log in at http://localhost:5173 with ${summary.owner.email} / ${summary.owner.password}`,
  );
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await ds.destroy();
}
