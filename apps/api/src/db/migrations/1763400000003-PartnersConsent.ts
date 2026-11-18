import type { MigrationInterface, QueryRunner } from 'typeorm';

export const PARTNER_SETTINGS: ReadonlyArray<[key: string, value: unknown, confirmed: boolean]> = [
  // Version of the privacy notice people are shown; stored on every consent record.
  ['privacy.notice_version', 'v1-draft', true],
];

/** Signed referral agreement upload on partners, and the privacy-notice version for consent records. */
export class PartnersConsent1763400000003 implements MigrationInterface {
  name = 'PartnersConsent1763400000003';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE partner ADD COLUMN referral_file_id uuid REFERENCES file(id)`);
    await q.query(
      `CREATE INDEX client_partner_idx ON client (partner_id) WHERE deleted_at IS NULL`,
    );
    for (const [key, value, confirmed] of PARTNER_SETTINGS) {
      await q.query(
        `INSERT INTO setting (key, value, confirmed) VALUES ($1, $2::jsonb, $3) ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value), confirmed],
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM setting WHERE key = ANY($1)`, [PARTNER_SETTINGS.map(([k]) => k)]);
    await q.query(`DROP INDEX client_partner_idx`);
    await q.query(`ALTER TABLE partner DROP COLUMN referral_file_id`);
  }
}
