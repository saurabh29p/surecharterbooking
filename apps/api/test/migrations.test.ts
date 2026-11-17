import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { makeDataSource } from '../src/db/data-source.js';
import { resetDb } from './db.js';

describe('schema', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = makeDataSource(process.env.DATABASE_URL!);
    await ds.initialize();
    await resetDb(ds);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('reverts and re-applies cleanly', async () => {
    const count = ds.migrations.length;
    for (let i = 0; i < count; i++) await ds.undoLastMigration({ transaction: 'each' });
    const after: { n: number }[] = await ds.query(
      `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migration'`,
    );
    expect(after[0]!.n).toBe(0);
    await ds.runMigrations({ transaction: 'each' });
    expect(await ds.showMigrations()).toBe(false);
    await resetDb(ds);
  });

  it('ships the airports and default settings', async () => {
    const airports: { iata: string }[] = await ds.query(`SELECT iata FROM airport`);
    expect(airports.map((a) => a.iata)).toEqual(
      expect.arrayContaining(['DEL', 'UDR', 'JSA', 'DED', 'COK', 'IXC', 'PGH']),
    );
    const [chase] = await ds.query(
      `SELECT value FROM setting WHERE key = 'today.chase_operator_hours'`,
    );
    expect(chase.value).toBe(2);
    const gst: { confirmed: boolean }[] = await ds.query(
      `SELECT confirmed FROM setting WHERE key LIKE 'gst.%'`,
    );
    expect(gst.every((g) => g.confirmed === false)).toBe(true);
  });

  it('gives weddings W-101 style codes', async () => {
    const [w] = await ds.query(`INSERT INTO wedding DEFAULT VALUES RETURNING code`);
    expect(w.code).toBe('W-101');
  });

  it('allows only one default business profile', async () => {
    await ds.query(`INSERT INTO business_profile (label, is_default) VALUES ('Delhi', true)`);
    await expect(
      ds.query(`INSERT INTO business_profile (label, is_default) VALUES ('Haryana', true)`),
    ).rejects.toThrow(/business_profile_one_default/);
  });

  it('defaults new business profiles to Delhi (state code 07)', async () => {
    const [p] = await ds.query(
      `INSERT INTO business_profile (label) VALUES ('X') RETURNING state_code`,
    );
    expect(p.state_code).toBe('07');
  });

  it('rejects zero or negative payments and mismatched payment directions', async () => {
    const [w] = await ds.query(`INSERT INTO wedding DEFAULT VALUES RETURNING id`);
    await expect(
      ds.query(
        `INSERT INTO payment (wedding_id, direction, amount, status) VALUES ($1, 'CLIENT_IN', 0, 'RECORDED')`,
        [w.id],
      ),
    ).rejects.toThrow();
    await expect(
      ds.query(
        `INSERT INTO payment (wedding_id, direction, amount, status) VALUES ($1, 'OPERATOR_OUT', 100, 'PAYABLE')`,
        [w.id],
      ),
    ).rejects.toThrow(); // needs an operator
  });

  it('keeps updated_at current on raw updates', async () => {
    const [p] = await ds.query(
      `INSERT INTO business_profile (label, updated_at) VALUES ('Y', now() - interval '1 day') RETURNING id, updated_at`,
    );
    const [[u]] = await ds.query(
      `UPDATE business_profile SET label = 'Z' WHERE id = $1 RETURNING updated_at`,
      [p.id],
    );
    expect(new Date(u.updated_at).getTime()).toBeGreaterThan(new Date(p.updated_at).getTime());
  });
});
