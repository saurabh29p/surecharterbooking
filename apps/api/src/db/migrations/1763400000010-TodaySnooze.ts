import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Step 13: "Later" on a Today action hides it until the given time. */
export class TodaySnooze1763400000010 implements MigrationInterface {
  name = 'TodaySnooze1763400000010';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE today_snooze (
        action_key text PRIMARY KEY,
        until timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES app_user(id)
      )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE today_snooze`);
  }
}
