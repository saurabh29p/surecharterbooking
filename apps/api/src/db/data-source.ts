import pg from 'pg';
import { DataSource, type DataSourceOptions } from 'typeorm';

// Calendar dates (flight day, expiry day) stay as "YYYY-MM-DD" strings. The driver's default turns them
// into JS Dates at local midnight, which can shift a date by one day depending on the server's time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);
import { AuditSubscriber } from '../audit/audit.subscriber.js';
import { ENTITIES } from './entities.js';
import { InitialSchema1763400000000 } from './migrations/1763400000000-InitialSchema.js';
import { ReferenceData1763400000001 } from './migrations/1763400000001-ReferenceData.js';
import { OperatorVerification1763400000002 } from './migrations/1763400000002-OperatorVerification.js';

/** Explicit lists (no globs) so this works the same under tsc output, Vitest and ESM. */
export const MIGRATIONS = [
  InitialSchema1763400000000,
  ReferenceData1763400000001,
  OperatorVerification1763400000002,
];

export function dataSourceOptions(url: string, ssl = false): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    subscribers: [AuditSubscriber],
    migrationsTableName: 'schema_migration',
    migrationsTransactionMode: 'each',
    synchronize: false,
  };
}

export function makeDataSource(url: string, ssl = false): DataSource {
  return new DataSource(dataSourceOptions(url, ssl));
}
