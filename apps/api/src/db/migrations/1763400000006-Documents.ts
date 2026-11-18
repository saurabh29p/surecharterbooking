import type { MigrationInterface, QueryRunner } from 'typeorm';
import { CLIENT_TERMS_V1 } from './templates-v1/client-terms.js';
import { OPERATOR_AGREEMENT_V1 } from './templates-v1/operator-agreement.js';
import { REFERRAL_AGREEMENT_V1 } from './templates-v1/referral-agreement.js';

/** The three agreement templates every install starts with (drafts until a lawyer approves them). */
export const TEMPLATES_V1: ReadonlyArray<[kind: string, name: string, body: string]> = [
  ['OPERATOR_AGREEMENT', 'Operator–Broker Agreement', OPERATOR_AGREEMENT_V1],
  ['CLIENT_TERMS', 'Client Charter Terms and Booking Confirmation', CLIENT_TERMS_V1],
  ['REFERRAL_AGREEMENT', 'Partner Referral Agreement', REFERRAL_AGREEMENT_V1],
];

/**
 * Step 9: agreement templates (v1 drafts), addresses the agreements and invoices need,
 * the placeholders a document was made without, and invoice cancellation.
 */
export class Documents1763400000006 implements MigrationInterface {
  name = 'Documents1763400000006';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE client ADD COLUMN address text`);
    await q.query(`ALTER TABLE partner ADD COLUMN address text, ADD COLUMN gstin text`);
    await q.query(`ALTER TABLE operator ADD COLUMN address text`);
    await q.query(
      `ALTER TABLE document_version ADD COLUMN missing_fields text[] NOT NULL DEFAULT '{}'`,
    );
    await q.query(`ALTER TABLE invoice ADD COLUMN cancel_reason text`);
    await q.query(`CREATE INDEX document_operator_idx ON document (operator_id)`);
    await q.query(`CREATE INDEX document_partner_idx ON document (partner_id)`);
    for (const [kind, name, body] of TEMPLATES_V1) {
      const [t] = await q.query(
        `INSERT INTO document_template (kind, name) VALUES ($1, $2)
         ON CONFLICT (kind) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [kind, name],
      );
      await q.query(
        `INSERT INTO template_version (template_id, version, body_md, lawyer_approved)
         VALUES ($1, 1, $2, false) ON CONFLICT (template_id, version) DO NOTHING`,
        [t.id, body],
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM document_template WHERE kind = ANY($1)`, [
      TEMPLATES_V1.map(([k]) => k),
    ]);
    await q.query(`DROP INDEX document_partner_idx`);
    await q.query(`DROP INDEX document_operator_idx`);
    await q.query(`ALTER TABLE invoice DROP COLUMN cancel_reason`);
    await q.query(`ALTER TABLE document_version DROP COLUMN missing_fields`);
    await q.query(`ALTER TABLE operator DROP COLUMN address`);
    await q.query(`ALTER TABLE partner DROP COLUMN address, DROP COLUMN gstin`);
    await q.query(`ALTER TABLE client DROP COLUMN address`);
  }
}
