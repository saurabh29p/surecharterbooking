import { DataSource, type DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities.js';
import { InitialSchema1763400000000 } from './migrations/1763400000000-InitialSchema.js';

/** Explicit lists (no globs) so this works the same under tsc output, Vitest and ESM. */
export const MIGRATIONS = [InitialSchema1763400000000];

export function dataSourceOptions(url: string, ssl = false): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'schema_migration',
    migrationsTransactionMode: 'each',
    synchronize: false,
  };
}

export function makeDataSource(url: string, ssl = false): DataSource {
  return new DataSource(dataSourceOptions(url, ssl));
}
