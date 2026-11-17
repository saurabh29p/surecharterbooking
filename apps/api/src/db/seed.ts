/**
 * `pnpm seed`: wipes the development database and fills it with fake data (BRIEF.md §8).
 * Refuses to run in production.
 */
import 'reflect-metadata';
import { loadConfig } from '../config.js';
import { EncryptionService } from '../crypto/encryption.service.js';
import { makeDataSource } from './data-source.js';
import { seed } from './seed-data.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error(
    'Refusing to seed: NODE_ENV is production. Seed data is fake and replaces everything.',
  );
  process.exit(1);
}
const ds = makeDataSource(config.DATABASE_URL, config.DATABASE_SSL);
await ds.initialize();
try {
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
} finally {
  await ds.destroy();
}
