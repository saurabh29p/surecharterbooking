import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Step 11: when a share link was last opened, and which link an acceptance came through. */
export class Sharing1763400000008 implements MigrationInterface {
  name = 'Sharing1763400000008';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE share ADD COLUMN last_opened_at timestamptz`);
    await q.query(`CREATE INDEX share_acceptance_share_idx ON share_acceptance (share_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX share_acceptance_share_idx`);
    await q.query(`ALTER TABLE share DROP COLUMN last_opened_at`);
  }
}
