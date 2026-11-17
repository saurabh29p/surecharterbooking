import 'reflect-metadata';
import pg from 'pg';
import { makeDataSource } from '../src/db/data-source.js';
import { TEST_ENV } from './env.js';

/** Wipe the test database and apply every migration once per test run. */
export default async function setup() {
  const url = TEST_ENV.DATABASE_URL;
  if (!/_test\b/.test(new URL(url).pathname)) {
    throw new Error(`Refusing to wipe a database whose name does not end in _test: ${url}`);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();

  const ds = makeDataSource(url);
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  await ds.destroy();
}
