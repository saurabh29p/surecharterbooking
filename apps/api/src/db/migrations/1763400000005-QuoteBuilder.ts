import { DEFAULT_CANCELLATION_SCHEDULE } from '@shubhjets/shared';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export const QUOTE_SETTINGS: ReadonlyArray<[key: string, value: unknown, confirmed: boolean]> = [
  // Our default cancellation schedule (tiers), compared with each operator's on every quote.
  ['quote.cancellation_schedule', DEFAULT_CANCELLATION_SCHEDULE, true],
];

/**
 * Quote builder (step 8): an ISSUED status (PDF made, validity running, not yet sent),
 * cancellation schedules for us and for operators, the frozen client-safe snapshot of an issued
 * quote, and quote-level "included / not included" text.
 */
export class QuoteBuilder1763400000005 implements MigrationInterface {
  name = 'QuoteBuilder1763400000005';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE quote DROP CONSTRAINT quote_status_check`);
    await q.query(`ALTER TABLE quote ADD CONSTRAINT quote_status_check
      CHECK (status IN ('DRAFT', 'ISSUED', 'SHARED', 'ACCEPTED', 'EXPIRED', 'SUPERSEDED'))`);
    await q.query(`ALTER TABLE quote
      ADD COLUMN cancellation_schedule jsonb,
      ADD COLUMN validity_hours integer NOT NULL DEFAULT 24 CHECK (validity_hours BETWEEN 1 AND 720),
      ADD COLUMN inclusions text,
      ADD COLUMN exclusions text,
      ADD COLUMN issued_at timestamptz,
      ADD COLUMN snapshot jsonb`);
    // One draft per wedding at a time.
    await q.query(
      `CREATE UNIQUE INDEX quote_one_draft_idx ON quote (wedding_id) WHERE status = 'DRAFT'`,
    );
    await q.query(`ALTER TABLE rate_response ADD COLUMN cancellation_schedule jsonb`);
    await q.query(`ALTER TABLE operator ADD COLUMN cancellation_schedule jsonb`);
    for (const [key, value, confirmed] of QUOTE_SETTINGS) {
      await q.query(
        `INSERT INTO setting (key, value, confirmed) VALUES ($1, $2::jsonb, $3) ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value), confirmed],
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM setting WHERE key = ANY($1)`, [QUOTE_SETTINGS.map(([k]) => k)]);
    await q.query(`ALTER TABLE operator DROP COLUMN cancellation_schedule`);
    await q.query(`ALTER TABLE rate_response DROP COLUMN cancellation_schedule`);
    await q.query(`DROP INDEX quote_one_draft_idx`);
    await q.query(`ALTER TABLE quote
      DROP COLUMN cancellation_schedule, DROP COLUMN validity_hours, DROP COLUMN inclusions,
      DROP COLUMN exclusions, DROP COLUMN issued_at, DROP COLUMN snapshot`);
    await q.query(`UPDATE quote SET status = 'SHARED' WHERE status = 'ISSUED'`);
    await q.query(`ALTER TABLE quote DROP CONSTRAINT quote_status_check`);
    await q.query(`ALTER TABLE quote ADD CONSTRAINT quote_status_check
      CHECK (status IN ('DRAFT', 'SHARED', 'ACCEPTED', 'EXPIRED', 'SUPERSEDED'))`);
  }
}
