import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Operator verification state and expiry-alert bookkeeping (rules 1 and 8). */
export class OperatorVerification1763400000002 implements MigrationInterface {
  name = 'OperatorVerification1763400000002';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE operator
        ADD COLUMN verified_at timestamptz,
        ADD COLUMN verified_by uuid REFERENCES app_user(id),
        ADD COLUMN block_kind text CHECK (block_kind IN ('MANUAL', 'EXPIRED')),
        ADD COLUMN blocked_at timestamptz,
        ADD CONSTRAINT operator_block_consistent CHECK ((status = 'BLOCKED') = (block_kind IS NOT NULL));

      -- One row per alert the daily job has raised, so each fires exactly once per document expiry.
      CREATE TABLE operator_expiry_alert (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_id uuid NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('NSOP', 'INSURANCE')),
        expires_on date NOT NULL,
        threshold_days integer NOT NULL CHECK (threshold_days IN (30, 7, 0)),
        raised_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (operator_id, kind, expires_on, threshold_days)
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE operator_expiry_alert`);
    await q.query(`
      ALTER TABLE operator
        DROP CONSTRAINT operator_block_consistent,
        DROP COLUMN blocked_at,
        DROP COLUMN block_kind,
        DROP COLUMN verified_by,
        DROP COLUMN verified_at;
    `);
  }
}
