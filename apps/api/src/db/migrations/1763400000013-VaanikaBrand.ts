import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brand change (WEBSITE.md §0): business profiles still carrying the old default brand name become
 * "Vaanika", and new profiles number invoices "VK/…". Any other name someone typed is left alone.
 */
export class VaanikaBrand1763400000013 implements MigrationInterface {
  name = 'VaanikaBrand1763400000013';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE business_profile SET brand_name = 'Vaanika' WHERE brand_name = 'ShubhJets'`,
    );
    // New profiles number invoices VK/…; existing profiles keep their prefix so numbering never jumps.
    await q.query(`ALTER TABLE business_profile ALTER COLUMN invoice_prefix SET DEFAULT 'VK'`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE business_profile ALTER COLUMN invoice_prefix SET DEFAULT 'SJ'`);
    await q.query(
      `UPDATE business_profile SET brand_name = 'ShubhJets' WHERE brand_name = 'Vaanika'`,
    );
  }
}
