import type { DataSource } from 'typeorm';

/** Empty every table (except migrations) and restart sequences, so each test starts clean. */
export async function resetDb(ds: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await ds.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migration'`,
  );
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await ds.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await ds.query(`ALTER SEQUENCE wedding_number_seq RESTART WITH 101`);
}
