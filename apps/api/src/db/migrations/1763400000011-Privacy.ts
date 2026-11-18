import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Step 14: when a person's data was erased on request (DPDP Act 2023). */
export class Privacy1763400000011 implements MigrationInterface {
  name = 'Privacy1763400000011';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE client ADD COLUMN erased_at timestamptz`);
    await q.query(`ALTER TABLE partner ADD COLUMN erased_at timestamptz`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE client DROP COLUMN erased_at`);
    await q.query(`ALTER TABLE partner DROP COLUMN erased_at`);
  }
}
