import type { EntityManager } from 'typeorm';
import { DEFAULT_SETTINGS } from './migrations/1763400000001-ReferenceData.js';
import { PARTNER_SETTINGS } from './migrations/1763400000003-PartnersConsent.js';
import { QUOTE_SETTINGS } from './migrations/1763400000005-QuoteBuilder.js';
import { TEMPLATES_V1 } from './migrations/1763400000006-Documents.js';

/** Every default setting shipped by migrations, for the seed and the test reset. */
export const ALL_DEFAULT_SETTINGS = [...DEFAULT_SETTINGS, ...PARTNER_SETTINGS, ...QUOTE_SETTINGS];

/** Puts the v1 agreement templates back (seed and test reset empty these tables). */
export async function insertDefaultTemplates(m: Pick<EntityManager, 'query'>): Promise<void> {
  for (const [kind, name, body] of TEMPLATES_V1) {
    const [t] = await m.query(
      `INSERT INTO document_template (kind, name) VALUES ($1, $2) RETURNING id`,
      [kind, name],
    );
    await m.query(
      `INSERT INTO template_version (template_id, version, body_md, lawyer_approved) VALUES ($1, 1, $2, false)`,
      [t.id, body],
    );
  }
}
