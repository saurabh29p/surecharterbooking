import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { seasonRange, toIstDate } from '@shubhjets/shared';
import { stringify } from 'csv-stringify/sync';
import type { DataSource } from 'typeorm';
import { PartnersService } from '../partners/partners.service.js';

/** UTF-8 byte-order mark: makes Excel read ₹ and Hindi names correctly. */
export const BOM = '﻿';

/**
 * Spreadsheet apps run cells that start with = + - @ (or tab/CR) as formulas, so a name like
 * "=HYPERLINK(...)" in a partner record could do harm when the export is opened. Prefix those with '.
 */
export function safeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Paise → plain rupees with 2 decimals for spreadsheets ("1015000.00"). */
const rupees = (paise: unknown) =>
  paise === null || paise === undefined ? '' : (Number(paise) / 100).toFixed(2);

function csv(header: string[], rows: unknown[][]): string {
  return (
    BOM + stringify([header, ...rows.map((r) => r.map(safeCell))], { record_delimiter: 'windows' })
  );
}

@Injectable()
export class ExportsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly partners: PartnersService,
  ) {}

  async partnersCsv(): Promise<string> {
    const rows: Record<string, unknown>[] = await this.ds.query(
      `SELECT id, type, firm, city, contact_person, phone, email, website, instagram, source_link, fit_note,
              status, commission_basis, commission_bps, referral_signed, next_follow_up_on, created_at
         FROM partner WHERE deleted_at IS NULL ORDER BY firm`,
    );
    const stats = await this.partners.stats();
    return csv(
      [
        'type',
        'firm',
        'city',
        'contact_person',
        'phone',
        'email',
        'website',
        'instagram',
        'source_link',
        'fit_note',
        'status',
        'commission_basis',
        'commission_percent',
        'referral_signed',
        'next_follow_up_on',
        'weddings_this_season',
        'bookings_value_inr',
        'commission_owed_inr',
        'added_on',
      ],
      rows.map((r) => {
        const s = stats.get(String(r.id));
        return [
          String(r.type).toLowerCase(),
          r.firm,
          r.city,
          r.contact_person,
          r.phone,
          r.email,
          r.website,
          r.instagram,
          r.source_link,
          r.fit_note,
          r.status,
          r.commission_basis,
          Number(r.commission_bps) / 100,
          r.referral_signed ? 'yes' : 'no',
          r.next_follow_up_on,
          s?.weddingsThisSeason ?? 0,
          rupees(s?.bookingsValue ?? 0),
          rupees(s?.commissionOwed ?? 0),
          toIstDate(r.created_at as Date),
        ];
      }),
    );
  }

  async weddingsCsv(): Promise<string> {
    const rows: Record<string, unknown>[] = await this.ds.query(
      `SELECT w.code, w.status, w.lost_reason, p.firm AS partner, c.name AS client, w.venue_city, w.starts_on, w.ends_on,
              w.lead_source, w.utm_source, w.utm_medium, w.utm_campaign, w.utm_term, w.utm_content, w.landing_page,
              (SELECT count(*) FROM leg l WHERE l.wedding_id = w.id) AS legs,
              (SELECT sum(l.pax) FROM leg l WHERE l.wedding_id = w.id) AS seats_flown,
              q.totals AS totals, q.status AS quote_status
         FROM wedding w
         LEFT JOIN partner p ON p.id = w.partner_id
         LEFT JOIN client c ON c.id = w.client_id
         LEFT JOIN LATERAL (
           SELECT totals, status FROM quote q WHERE q.wedding_id = w.id
            ORDER BY (q.status = 'ACCEPTED') DESC, q.version DESC LIMIT 1
         ) q ON true
        WHERE w.deleted_at IS NULL
        ORDER BY w.number`,
    );
    return csv(
      [
        'code',
        'status',
        'lost_reason',
        'partner',
        'client',
        'venue_city',
        'starts_on',
        'ends_on',
        'lead_source',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'landing_page',
        'legs',
        'passenger_seats',
        'quote_status',
        'sell_ex_gst_inr',
        'cost_inr',
        'margin_inr',
        'gst_inr',
        'total_inr',
        'commission_inr',
      ],
      rows.map((r) => {
        const t = (r.totals ?? {}) as {
          sellSubtotal?: number;
          cost?: number;
          margin?: number;
          gst?: { total?: number };
          total?: number;
          commission?: number;
        };
        const has = r.quote_status !== null && r.quote_status !== undefined;
        return [
          r.code,
          r.status,
          r.lost_reason,
          r.partner,
          r.client,
          r.venue_city,
          r.starts_on,
          r.ends_on,
          r.lead_source,
          r.utm_source,
          r.utm_medium,
          r.utm_campaign,
          r.utm_term,
          r.utm_content,
          r.landing_page,
          r.legs,
          r.seats_flown,
          r.quote_status,
          has ? rupees(t.sellSubtotal) : '',
          has ? rupees(t.cost) : '',
          has ? rupees(t.margin) : '',
          has ? rupees(t.gst?.total) : '',
          has ? rupees(t.total) : '',
          has ? rupees(t.commission) : '',
        ];
      }),
    );
  }

  /** "shubhjets-partners-2026-11-18.csv" (season label kept out of names so files sort by date). */
  fileName(what: 'partners' | 'weddings'): string {
    void seasonRange;
    return `shubhjets-${what}-${toIstDate(new Date())}.csv`;
  }
}
