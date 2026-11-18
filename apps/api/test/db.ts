import type { DataSource } from 'typeorm';
import { ALL_DEFAULT_SETTINGS, insertDefaultTemplates } from '../src/db/default-settings.js';
import { AIRPORTS } from '../src/db/migrations/1763400000001-ReferenceData.js';

/**
 * Empty every table (except migrations), restart sequences and put the reference data
 * (airports, default settings) back, so each test starts from a freshly migrated database.
 */
export async function resetDb(ds: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await ds.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migration'`,
  );
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await ds.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await ds.query(`ALTER SEQUENCE wedding_number_seq RESTART WITH 101`);
  for (const [iata, icao, city, name, state] of AIRPORTS) {
    await ds.query(
      `INSERT INTO airport (iata, icao, city, name, state_code) VALUES ($1, $2, $3, $4, $5)`,
      [iata, icao, city, name, state],
    );
  }
  for (const [key, value, confirmed] of ALL_DEFAULT_SETTINGS) {
    await ds.query(`INSERT INTO setting (key, value, confirmed) VALUES ($1, $2::jsonb, $3)`, [
      key,
      JSON.stringify(value),
      confirmed,
    ]);
  }
  await insertDefaultTemplates(ds);
}
