/**
 * Runs pending migrations: `pnpm --filter @shubhjets/api db:migrate`.
 * `--revert` undoes the last one (development only).
 */
import 'reflect-metadata';
import { loadConfig } from '../config.js';
import { makeDataSource } from './data-source.js';

const config = loadConfig();
const ds = makeDataSource(config.DATABASE_URL, config.DATABASE_SSL);
await ds.initialize();
try {
  if (process.argv.includes('--revert')) {
    if (config.NODE_ENV === 'production')
      throw new Error('Refusing to revert migrations in production');
    await ds.undoLastMigration({ transaction: 'each' });
    console.log('Reverted the last migration.');
  } else {
    const ran = await ds.runMigrations({ transaction: 'each' });
    console.log(
      ran.length ? `Applied: ${ran.map((m) => m.name).join(', ')}` : 'Database is up to date.',
    );
  }
} finally {
  await ds.destroy();
}
