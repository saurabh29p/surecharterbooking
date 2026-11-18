import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Consent sources are a fixed list (shared CONSENT_SOURCES); the database refuses anything else. */
export class ConsentSourceCheck1763400000004 implements MigrationInterface {
  name = 'ConsentSourceCheck1763400000004';

  async up(q: QueryRunner): Promise<void> {
    // Development databases seeded before this fix used 'seed'; map it to a real source.
    await q.query(`UPDATE consent SET source = 'RESEARCH_IMPORT' WHERE source NOT IN
      ('VERBAL_CALL', 'WHATSAPP', 'EMAIL', 'WEBSITE_FORM', 'SIGNED_AGREEMENT', 'RESEARCH_IMPORT')`);
    await q.query(`ALTER TABLE consent ADD CONSTRAINT consent_source_check CHECK (source IN
      ('VERBAL_CALL', 'WHATSAPP', 'EMAIL', 'WEBSITE_FORM', 'SIGNED_AGREEMENT', 'RESEARCH_IMPORT'))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE consent DROP CONSTRAINT consent_source_check`);
  }
}
