import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Step 12: website enquiries, partner sign-ups and WhatsApp/call taps from the public site,
 * linked to the client or partner they created, with a key to spot repeat submissions.
 */
export class Enquiries1763400000009 implements MigrationInterface {
  name = 'Enquiries1763400000009';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE enquiry DROP CONSTRAINT enquiry_source_check`);
    await q.query(`ALTER TABLE enquiry ADD CONSTRAINT enquiry_source_check
      CHECK (source IN ('WEBSITE', 'PASTE', 'PARTNER_SIGNUP', 'WHATSAPP_TAP', 'CALL_TAP'))`);
    await q.query(`ALTER TABLE enquiry
      ADD COLUMN client_id uuid REFERENCES client(id),
      ADD COLUMN partner_id uuid REFERENCES partner(id),
      ADD COLUMN dedupe_key text,
      ADD COLUMN spam_reason text`);
    await q.query(`CREATE INDEX enquiry_dedupe_idx ON enquiry (dedupe_key, created_at DESC)`);
    await q.query(`CREATE INDEX enquiry_wedding_idx ON enquiry (wedding_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX enquiry_wedding_idx`);
    await q.query(`DROP INDEX enquiry_dedupe_idx`);
    await q.query(
      `ALTER TABLE enquiry DROP COLUMN client_id, DROP COLUMN partner_id, DROP COLUMN dedupe_key, DROP COLUMN spam_reason`,
    );
    await q.query(`DELETE FROM enquiry WHERE source NOT IN ('WEBSITE', 'PASTE')`);
    await q.query(`ALTER TABLE enquiry DROP CONSTRAINT enquiry_source_check`);
    await q.query(
      `ALTER TABLE enquiry ADD CONSTRAINT enquiry_source_check CHECK (source IN ('WEBSITE', 'PASTE'))`,
    );
  }
}
