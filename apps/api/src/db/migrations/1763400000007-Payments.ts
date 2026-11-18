import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 10: operator GST on payouts (paid on top of the net), when a wedding was confirmed,
 * and when a guest's ID file was deleted (kept as a fact after the file is gone).
 */
export class Payments1763400000007 implements MigrationInterface {
  name = 'Payments1763400000007';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE payment ADD COLUMN gst_amount bigint NOT NULL DEFAULT 0 CHECK (gst_amount >= 0)`,
    );
    await q.query(`ALTER TABLE wedding ADD COLUMN confirmed_at timestamptz`);
    await q.query(`ALTER TABLE guest ADD COLUMN id_deleted_at timestamptz`);
    await q.query(
      `CREATE INDEX guest_id_file_idx ON guest (id_file_id) WHERE id_file_id IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX guest_id_file_idx`);
    await q.query(`ALTER TABLE guest DROP COLUMN id_deleted_at`);
    await q.query(`ALTER TABLE wedding DROP COLUMN confirmed_at`);
    await q.query(`ALTER TABLE payment DROP COLUMN gst_amount`);
  }
}
