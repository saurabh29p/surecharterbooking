import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reference data every environment needs (not fake data): airports and default settings.
 * GST values are placeholders (confirmed = false) until the CA confirms them.
 */
export const AIRPORTS: ReadonlyArray<
  [iata: string, icao: string, city: string, name: string, state: string]
> = [
  ['DEL', 'VIDP', 'New Delhi', 'Indira Gandhi International', '07'],
  ['BOM', 'VABB', 'Mumbai', 'Chhatrapati Shivaji Maharaj International', '27'],
  ['BLR', 'VOBL', 'Bengaluru', 'Kempegowda International', '29'],
  ['HYD', 'VOHS', 'Hyderabad', 'Rajiv Gandhi International', '36'],
  ['MAA', 'VOMM', 'Chennai', 'Chennai International', '33'],
  ['CCU', 'VECC', 'Kolkata', 'Netaji Subhas Chandra Bose International', '19'],
  ['AMD', 'VAAH', 'Ahmedabad', 'Sardar Vallabhbhai Patel International', '24'],
  ['PNQ', 'VAPO', 'Pune', 'Pune Airport', '27'],
  ['UDR', 'VAUD', 'Udaipur', 'Maharana Pratap Airport', '08'],
  ['JAI', 'VIJP', 'Jaipur', 'Jaipur International', '08'],
  ['JDH', 'VIJO', 'Jodhpur', 'Jodhpur Airport', '08'],
  ['JSA', 'VIJR', 'Jaisalmer', 'Jaisalmer Airport', '08'],
  ['GOI', 'VOGO', 'Goa (Dabolim)', 'Dabolim Airport', '30'],
  ['GOX', 'VOGA', 'Goa (Mopa)', 'Manohar International', '30'],
  ['PGH', 'VIPT', 'Pantnagar (Jim Corbett)', 'Pantnagar Airport', '05'],
  ['DED', 'VIDN', 'Dehradun', 'Jolly Grant Airport', '05'],
  ['COK', 'VOCI', 'Kochi', 'Cochin International', '32'],
  ['IXC', 'VICG', 'Chandigarh', 'Shaheed Bhagat Singh International', '04'],
];

export const DEFAULT_SETTINGS: ReadonlyArray<[key: string, value: unknown, confirmed: boolean]> = [
  ['markup.default_bps', 1000, true],
  ['commission.default', { basis: 'MARGIN_SHARE', bps: 2000 }, true],
  ['quote.validity_hours', 24, true],
  ['quote.cancellation_terms', '', false],
  ['payment.required_bps', 10000, true],
  ['target.monthly_margin_paise', 2_000_000_00, true],
  ['gst.rate_bps', 1800, false],
  ['gst.sac', '', false],
  ['invoicing.model', 'FULL_VALUE', true],
  ['guest_id.retention_days', 30, true],
  ['share.link_expiry_days', 14, true],
  ['today.chase_operator_hours', 2, true],
  ['today.quote_expiry_warn_hours', 3, true],
  ['today.guest_ids_due_days', 5, true],
  ['ai.monthly_cap_paise', 2000_00, true],
];

export class ReferenceData1763400000001 implements MigrationInterface {
  name = 'ReferenceData1763400000001';

  async up(q: QueryRunner): Promise<void> {
    for (const [iata, icao, city, name, state] of AIRPORTS) {
      await q.query(
        `INSERT INTO airport (iata, icao, city, name, state_code) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (iata) DO NOTHING`,
        [iata, icao, city, name, state],
      );
    }
    for (const [key, value, confirmed] of DEFAULT_SETTINGS) {
      await q.query(
        `INSERT INTO setting (key, value, confirmed) VALUES ($1, $2::jsonb, $3) ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value), confirmed],
      );
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM setting WHERE key = ANY($1)`, [DEFAULT_SETTINGS.map(([k]) => k)]);
    await q.query(`DELETE FROM airport WHERE iata = ANY($1)`, [AIRPORTS.map(([i]) => i)]);
  }
}
