import type { MigrationInterface, QueryRunner } from 'typeorm';

const JETS = `'TURBOPROP', 'LIGHT', 'MIDSIZE', 'SUPER_MIDSIZE', 'HEAVY'`;
const ALL = `${JETS}, 'HELICOPTER_SINGLE', 'HELICOPTER_TWIN'`;

/**
 * Helicopters for weddings: helicopter categories, legs that start or end at a venue or helipad,
 * a service type and a permissions checklist per helicopter leg, and hourly pricing on replies.
 */
export class Helicopters1763400000012 implements MigrationInterface {
  name = 'Helicopters1763400000012';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE aircraft DROP CONSTRAINT aircraft_category_check`);
    await q.query(
      `ALTER TABLE aircraft ADD CONSTRAINT aircraft_category_check CHECK (category IN (${ALL}))`,
    );
    await q.query(`ALTER TABLE leg DROP CONSTRAINT leg_category_check`);
    await q.query(`ALTER TABLE leg ADD CONSTRAINT leg_category_check CHECK (category IN (${ALL}))`);
    await q.query(`
      ALTER TABLE leg
        ADD COLUMN from_site jsonb,
        ADD COLUMN to_site jsonb,
        ADD COLUMN service_type text
          CHECK (service_type IN ('TRANSFER', 'BRIDE_GROOM_ENTRY', 'FLOWER_SHOWER', 'JOYRIDE')),
        ADD COLUMN heli_checks jsonb NOT NULL DEFAULT '{}'`);
    // Same airport both ends is fine when a venue or helipad is named (e.g. airport → venue in one city).
    await q.query(`ALTER TABLE leg DROP CONSTRAINT leg_check`);
    await q.query(`ALTER TABLE leg ADD CONSTRAINT leg_ends_differ
      CHECK (from_iata <> to_iata OR from_site IS NOT NULL OR to_site IS NOT NULL)`);
    // Venues, helipads and helicopter services only on helicopter legs.
    await q.query(`ALTER TABLE leg ADD CONSTRAINT leg_heli_only CHECK (
      category IN ('HELICOPTER_SINGLE', 'HELICOPTER_TWIN')
      OR (from_site IS NULL AND to_site IS NULL AND service_type IS NULL))`);
    // Hourly pricing on a reply: {hourlyRate, flyingMinutes, positioning, waiting} in paise; net_rate is their total.
    await q.query(`ALTER TABLE rate_response ADD COLUMN pricing jsonb`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE rate_response DROP COLUMN pricing`);
    await q.query(`DELETE FROM leg WHERE category IN ('HELICOPTER_SINGLE', 'HELICOPTER_TWIN')`);
    await q.query(
      `DELETE FROM aircraft WHERE category IN ('HELICOPTER_SINGLE', 'HELICOPTER_TWIN')`,
    );
    await q.query(`ALTER TABLE leg DROP CONSTRAINT leg_heli_only, DROP CONSTRAINT leg_ends_differ`);
    await q.query(`ALTER TABLE leg ADD CONSTRAINT leg_check CHECK (from_iata <> to_iata)`);
    await q.query(
      `ALTER TABLE leg DROP COLUMN from_site, DROP COLUMN to_site, DROP COLUMN service_type, DROP COLUMN heli_checks`,
    );
    await q.query(`ALTER TABLE leg DROP CONSTRAINT leg_category_check`);
    await q.query(
      `ALTER TABLE leg ADD CONSTRAINT leg_category_check CHECK (category IN (${JETS}))`,
    );
    await q.query(`ALTER TABLE aircraft DROP CONSTRAINT aircraft_category_check`);
    await q.query(
      `ALTER TABLE aircraft ADD CONSTRAINT aircraft_category_check CHECK (category IN (${JETS}))`,
    );
  }
}
