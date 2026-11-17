/**
 * Fake data for development and demos (BRIEF.md §8). Never real company names, people,
 * NSOP numbers or aircraft registrations: every name is "Planner P1", "Operator A" etc.,
 * emails use example.test, NSOP numbers start with TEST- and registrations are impossible (VT-ZZ1).
 * Dates are relative to "today" so the Today screen always has something realistic to show.
 */
import {
  addDays,
  computeQuoteTotals,
  fakeGstin,
  toIstDate,
  type IsoDate,
  type QuoteLineInput,
} from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { hashPassword } from '../auth/password.js';
import { DEFAULT_SETTINGS } from './migrations/1763400000001-ReferenceData.js';
import type { EncryptionService } from '../crypto/encryption.service.js';

export const SEED_OWNER = { email: 'owner@shubhjets.test', password: 'shubhjets dev passphrase' };

/** Demo and test accounts all use the reserved .test domain, which can never receive real email. */
export const isDemoEmail = (email: string) => /@[^@]+\.test$/i.test(email.trim());

/**
 * Seeding wipes everything, so it refuses unless this is clearly a development database:
 * never in production, and never when real (non-demo) accounts exist unless `force` is given.
 */
export async function assertSeedAllowed(
  ds: DataSource,
  env: { NODE_ENV: string },
  opts: { force?: boolean } = {},
): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV is production. Seed data is fake and would replace all real data.',
    );
  }
  const users: { email: string }[] = await ds.query(`SELECT email FROM app_user`);
  const real = users.filter((u) => !isDemoEmail(u.email));
  if (real.length > 0 && !opts.force) {
    throw new Error(
      `Refusing to seed: this database has real accounts (${real.map((u) => u.email).join(', ')}). ` +
        'Seeding would erase everything. If this really is a throwaway development database, run: pnpm seed --force',
    );
  }
}

const L = 1_00_000_00; // ₹1 lakh in paise

type Row = Record<string, unknown>;

async function ins(m: EntityManager, table: string, row: Row): Promise<string> {
  const cols = Object.keys(row);
  const vals = Object.values(row).map((v) =>
    v !== null &&
    typeof v === 'object' &&
    !(v instanceof Date) &&
    !Buffer.isBuffer(v) &&
    !Array.isArray(v)
      ? JSON.stringify(v)
      : v,
  );
  const [res] = await m.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    vals,
  );
  return (res as { id?: string }).id ?? '';
}

/** Tables holding seedable data (everything except migrations and reference data). */
const DATA_TABLES = [
  'audit_log',
  'task',
  'share_acceptance',
  'share',
  'document_version',
  'invoice',
  'payment',
  'quote_line',
  'quote',
  'leg_choice',
  'rate_response_leg',
  'rate_response',
  'rate_request_leg',
  'rate_request',
  'document',
  'template_version',
  'document_template',
  'guest',
  'leg',
  'enquiry',
  'wedding',
  'operator_document',
  'aircraft',
  'operator_contact',
  'operator_base',
  'operator',
  'consent',
  'client',
  'partner_activity',
  'partner',
  'invoice_sequence',
  'business_profile',
  'file_access_log',
  'file',
  'refresh_token',
  'app_user',
];

export interface SeedSummary {
  owner: typeof SEED_OWNER;
  counts: Record<string, number>;
}

export async function seed(
  ds: DataSource,
  crypto: EncryptionService,
  now = new Date(),
): Promise<SeedSummary> {
  const today = toIstDate(now);
  const day = (n: number): IsoDate => addDays(today, n);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  await ds.transaction(async (m) => {
    await m.query(`TRUNCATE ${DATA_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    await m.query(`ALTER SEQUENCE wedding_number_seq RESTART WITH 101`);
    // TRUNCATE ... CASCADE also empties tables that reference app_user (setting.updated_by),
    // so put the default settings back. Airports have no such reference and are untouched.
    await m.query(`DELETE FROM setting`);
    for (const [key, value, confirmed] of DEFAULT_SETTINGS) {
      await m.query(`INSERT INTO setting (key, value, confirmed) VALUES ($1, $2::jsonb, $3)`, [
        key,
        JSON.stringify(value),
        confirmed,
      ]);
    }

    // ---------- Owner and business profile ----------
    const owner = await ins(m, 'app_user', {
      email: SEED_OWNER.email,
      password_hash: await hashPassword(SEED_OWNER.password),
      name: 'Demo Owner',
      role: 'OWNER',
      setup_completed_at: now,
    });
    const bank = {
      accountName: 'Example Exim LLP',
      accountNumber: '000011112222',
      ifsc: 'EXMP0000001',
      bankName: 'Example Bank',
      branch: 'Connaught Place',
    };
    const profile = await ins(m, 'business_profile', {
      label: 'Delhi',
      brand_name: 'ShubhJets',
      legal_name: 'Example Exim LLP',
      llpin: 'AAA-0000',
      gstin: fakeGstin('07', 'AAAFE0000A'),
      state_code: '07',
      registered_address: '1 Example Road, New Delhi 110001',
      bank_details_enc: crypto.encryptJson(bank),
      bank_hint: 'Example Bank ••••2222',
      signatory_name: 'Demo Partner',
      signatory_designation: 'Designated Partner',
      arbitration_seat_city: 'New Delhi',
      invoice_prefix: 'SJ',
      is_default: true,
      created_by: owner,
    });

    // ---------- Partners ----------
    const partner = async (
      n: string,
      type: 'PLANNER' | 'HOTEL',
      city: string,
      status: string,
      extra: Row = {},
    ) => {
      const id = await ins(m, 'partner', {
        type,
        firm: type === 'HOTEL' ? `Hotel ${n}` : `Planner ${n}`,
        city,
        contact_person: `Contact ${n}`,
        phone: `+9190000000${n.replace(/\D/g, '').padStart(2, '0')}`,
        email: `${n.toLowerCase()}@example.test`,
        website: `https://${n.toLowerCase()}.example.test`,
        instagram: `@${n.toLowerCase()}_example`,
        source_link: 'https://example.test/research-list',
        fit_note: 'Fake partner for development',
        status,
        created_by: owner,
        ...extra,
      });
      await ins(m, 'consent', {
        subject_type: 'PARTNER',
        subject_id: id,
        notice_version: 'seed-v1',
        given_at: now,
        source: 'seed',
      });
      return id;
    };
    const p1 = await partner('P1', 'PLANNER', 'New Delhi', 'ACTIVE', {
      referral_signed: true,
      next_follow_up_on: day(3),
    });
    const p2 = await partner('P2', 'PLANNER', 'Mumbai', 'ACTIVE', {
      referral_signed: true,
      commission_basis: 'BOOKING_PERCENT',
      commission_bps: 200,
    });
    const p3 = await partner('P3', 'PLANNER', 'Jaipur', 'CALL_DONE', { next_follow_up_on: day(0) });
    await partner('P4', 'PLANNER', 'Udaipur', 'IMPORTED');
    const h1 = await partner('H1', 'HOTEL', 'Udaipur', 'CONTACTED', { next_follow_up_on: day(-1) });
    for (const [pid, kind, h] of [
      [p1, 'MET', 400],
      [p1, 'CALLED', 30],
      [p3, 'CALL_BOOKED', 48],
      [h1, 'SENT_DECK', 72],
      [h1, 'NO_ANSWER', 24],
    ] as const) {
      await ins(m, 'partner_activity', {
        partner_id: pid,
        kind,
        at: hoursAgo(h),
        created_by: owner,
      });
    }

    // ---------- Clients ----------
    const client = async (n: number, partnerId: string | null) => {
      const id = await ins(m, 'client', {
        name: `Client C${n} Family`,
        phone: `+9191111111${String(n).padStart(2, '0')}`,
        email: `client.c${n}@example.test`,
        partner_id: partnerId,
        created_by: owner,
      });
      await ins(m, 'consent', {
        subject_type: 'CLIENT',
        subject_id: id,
        notice_version: 'seed-v1',
        given_at: now,
        source: 'seed',
      });
      return id;
    };
    const c1 = await client(1, null);
    const c2 = await client(2, p1);
    const c3 = await client(3, p2);
    const c4 = await client(4, p1);
    const c5 = await client(5, h1);
    const c6 = await client(6, p2);

    // ---------- Operators and aircraft ----------
    const operator = async (
      letter: string,
      status: string,
      bases: string[],
      opts: { nsopExpires: number; insuranceExpires: number; verified: boolean; rank?: number },
    ) => {
      const id = await ins(m, 'operator', {
        legal_name: `Operator ${letter} Aviation Pvt Ltd`,
        brand: `Operator ${letter}`,
        cin: `U00000DL2020PTC00000${letter.charCodeAt(0) - 64}`,
        gstin: fakeGstin('07', `AAACO000${letter.charCodeAt(0) - 64}${letter}`),
        nsop_no: `TEST-NSOP-00${letter.charCodeAt(0) - 64}`,
        nsop_issued_on: day(-700),
        nsop_expires_on: day(opts.nsopExpires),
        insurance_expires_on: day(opts.insuranceExpires),
        website: `https://operator-${letter.toLowerCase()}.example.test`,
        safety_disclosure_url: `https://operator-${letter.toLowerCase()}.example.test/safety`,
        dgca_rank: opts.rank ?? null,
        dgca_rank_checked_on: opts.rank ? day(-20) : null,
        dgca_rank_source: opts.rank ? 'Fake ranking for development' : null,
        bank_details_enc: opts.verified
          ? crypto.encryptJson({
              accountName: `Operator ${letter}`,
              accountNumber: `99990000${letter.charCodeAt(0)}`,
              ifsc: 'EXMP0000002',
              bankName: 'Example Bank',
            })
          : null,
        bank_hint: opts.verified ? `Example Bank ••••00${letter.charCodeAt(0)}` : null,
        cancellation_terms:
          'More than 7 days before departure: 10% of the charter price. 7 to 3 days: 50%. Less than 72 hours: 100%.',
        status,
        verified_at: opts.verified ? hoursAgo(24 * 30) : null,
        verified_by: opts.verified ? owner : null,
        created_by: owner,
      });
      for (const iata of bases)
        await ins(m, 'operator_base', { operator_id: id, airport_iata: iata });
      await ins(m, 'operator_contact', {
        operator_id: id,
        name: `Ops Desk ${letter}`,
        role: 'Charter sales',
        phone: `+9192222222${letter.charCodeAt(0) - 64}0`,
        email: `ops@operator-${letter.toLowerCase()}.example.test`,
        is_primary: true,
      });
      if (opts.verified) {
        await ins(m, 'operator_document', {
          operator_id: id,
          kind: 'NSOP',
          expires_on: day(opts.nsopExpires),
          verified_on: day(-30),
          verified_by: owner,
        });
        await ins(m, 'operator_document', {
          operator_id: id,
          kind: 'INSURANCE',
          expires_on: day(opts.insuranceExpires),
          verified_on: day(-30),
          verified_by: owner,
        });
      }
      return id;
    };
    const opA = await operator('A', 'VERIFIED', ['DEL', 'UDR'], {
      nsopExpires: 400,
      insuranceExpires: 200,
      verified: true,
      rank: 3,
    });
    const opB = await operator('B', 'VERIFIED', ['BOM', 'DEL'], {
      nsopExpires: 500,
      insuranceExpires: 150,
      verified: true,
      rank: 7,
    });
    const opC = await operator('C', 'EXPIRING_SOON', ['DEL', 'JAI'], {
      nsopExpires: 300,
      insuranceExpires: 9,
      verified: true,
    });
    const opD = await operator('D', 'FOUND', ['BOM', 'GOX'], {
      nsopExpires: 250,
      insuranceExpires: 120,
      verified: false,
    });

    const aircraft = async (
      op: string,
      type: string,
      reg: string,
      category: string,
      seats: number,
      year: number,
      base: string,
    ) =>
      ins(m, 'aircraft', {
        operator_id: op,
        type,
        registration: reg,
        category,
        seats,
        year,
        base_airport: base,
      });
    const aA1 = await aircraft(opA, 'Hawker 800XP', 'VT-ZZ1', 'MIDSIZE', 8, 2008, 'DEL');
    await aircraft(opA, 'Legacy 600', 'VT-ZZ2', 'HEAVY', 13, 2010, 'DEL');
    const aB1 = await aircraft(opB, 'Citation XLS', 'VT-ZZ3', 'MIDSIZE', 8, 2012, 'BOM');
    const aB2 = await aircraft(opB, 'Challenger 605', 'VT-ZZ4', 'SUPER_MIDSIZE', 10, 2014, 'BOM');
    const aC1 = await aircraft(opC, 'King Air B200', 'VT-ZZ5', 'TURBOPROP', 7, 2006, 'DEL');
    await aircraft(opC, 'Phenom 300', 'VT-ZZ6', 'LIGHT', 6, 2016, 'JAI');
    await aircraft(opD, 'Citation CJ2', 'VT-ZZ7', 'LIGHT', 6, 2009, 'BOM');

    // ---------- Weddings ----------
    const wedding = async (w: Row) =>
      ins(m, 'wedding', { business_profile_id: profile, created_by: owner, ...w });
    const leg = async (
      weddingId: string,
      seq: number,
      from: string,
      to: string,
      date: IsoDate,
      pax: number,
      category: string,
      status: string,
      window: [string, string] = ['09:00', '12:00'],
    ) =>
      ins(m, 'leg', {
        wedding_id: weddingId,
        seq,
        from_iata: from,
        to_iata: to,
        flight_date: date,
        window_from: window[0],
        window_to: window[1],
        pax,
        category,
        status,
      });

    const rateRequest = async (
      weddingId: string,
      op: string,
      legs: string[],
      sentHoursAgo: number,
    ) => {
      const id = await ins(m, 'rate_request', {
        wedding_id: weddingId,
        operator_id: op,
        channel: 'WHATSAPP',
        sent_at: hoursAgo(sentHoursAgo),
        created_by: owner,
      });
      for (const l of legs) await ins(m, 'rate_request_leg', { rate_request_id: id, leg_id: l });
      return id;
    };
    const rate = async (
      weddingId: string,
      op: string,
      req: string | null,
      ac: string | null,
      seats: number,
      net: number,
      legs: { id: string; share: number }[],
      receivedHoursAgo: number,
    ) => {
      const id = await ins(m, 'rate_response', {
        wedding_id: weddingId,
        operator_id: op,
        rate_request_id: req,
        aircraft_id: ac,
        seats,
        net_rate: net,
        inclusions: 'Fuel, crew, airport charges, catering for guests',
        exclusions: 'GST, overnight crew stay beyond 2 nights',
        cancellation_terms: 'More than 7 days: 10%. 7 to 3 days: 50%. Under 72 hours: 100%.',
        valid_until: new Date(now.getTime() + 48 * 3_600_000),
        received_at: hoursAgo(receivedHoursAgo),
        raw_text: 'Fake operator reply for development.',
        source: 'MANUAL',
        created_by: owner,
      });
      for (const l of legs)
        await ins(m, 'rate_response_leg', {
          rate_response_id: id,
          leg_id: l.id,
          cost_share: l.share,
        });
      return id;
    };

    /** A quote whose totals come from the same shared maths the app uses. */
    const quote = async (
      weddingId: string,
      status: string,
      lines: { leg: string | null; rr: string | null; desc: string; input: QuoteLineInput }[],
      commission: { basis: string; bps: number } | null,
      extra: Row = {},
    ) => {
      const totals = computeQuoteTotals({
        lines: lines.map((l) => l.input),
        gst: { rateBps: 1800, model: 'FULL_VALUE', supplierState: '07', placeOfSupplyState: '07' },
        commission: commission as never,
      });
      const id = await ins(m, 'quote', {
        wedding_id: weddingId,
        version: 1,
        business_profile_id: profile,
        status,
        valid_until: new Date(now.getTime() + 24 * 3_600_000),
        gst_rate_bps: 1800,
        gst_sac: null,
        invoicing_model: 'FULL_VALUE',
        place_of_supply_state: '07',
        cancellation_terms:
          'Follows the operator terms: more than 7 days 10%, 7 to 3 days 50%, under 72 hours 100%.',
        commission_basis: commission?.basis ?? null,
        commission_bps: commission?.bps ?? null,
        totals,
        created_by: owner,
        ...extra,
      });
      for (const [i, l] of lines.entries()) {
        const priced = totals.lines[i]!;
        await ins(m, 'quote_line', {
          quote_id: id,
          seq: i + 1,
          leg_id: l.leg,
          rate_response_id: l.rr,
          description: l.desc,
          cost: priced.cost,
          markup_type: 'markupType' in l.input ? l.input.markupType : null,
          markup_value:
            'markupBps' in l.input
              ? l.input.markupBps
              : 'markupAmount' in l.input
                ? l.input.markupAmount
                : null,
          sell: priced.sell,
        });
      }
      return { id, totals };
    };
    const tenPct = (cost: number): QuoteLineInput => ({
      cost,
      markupType: 'PERCENT',
      markupBps: 1000,
    });

    // W-101: new website enquiry, legs drafted, no rates yet.
    const w101 = await wedding({
      client_id: c1,
      venue_city: 'Udaipur',
      starts_on: day(30),
      ends_on: day(32),
      lead_source: 'WEBSITE',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'delhi-udaipur',
      landing_page: '/routes/delhi-to-udaipur',
      status: 'ENQUIRY',
    });
    await ins(m, 'enquiry', {
      source: 'WEBSITE',
      raw_text: '20 guests from Delhi to Udaipur, wedding next month',
      payload: { role: 'family', guests: 20 },
      wedding_id: w101,
    });
    await leg(w101, 1, 'DEL', 'UDR', day(29), 20, 'HEAVY', 'OPEN');
    await leg(w101, 2, 'UDR', 'DEL', day(33), 20, 'HEAVY', 'OPEN', ['14:00', '17:00']);

    // W-102: rates requested from 4 operators; 2 of 4 replies in, the others overdue (chase after 2 h).
    const w102 = await wedding({
      partner_id: p1,
      client_id: c2,
      venue_city: 'Jaipur',
      starts_on: day(20),
      ends_on: day(21),
      lead_source: 'PARTNER',
      status: 'RATES_REQUESTED',
    });
    const l102 = await leg(w102, 1, 'DEL', 'JAI', day(19), 8, 'MIDSIZE', 'RATES_IN');
    const l102b = await leg(w102, 2, 'JAI', 'DEL', day(22), 8, 'MIDSIZE', 'RATES_REQUESTED', [
      '15:00',
      '18:00',
    ]);
    const rqA = await rateRequest(w102, opA, [l102, l102b], 6);
    const rqB = await rateRequest(w102, opB, [l102, l102b], 6);
    await rateRequest(w102, opC, [l102, l102b], 6);
    await rateRequest(w102, opD, [l102, l102b], 5);
    await rate(
      w102,
      opA,
      rqA,
      aA1,
      8,
      9.5 * L,
      [
        { id: l102, share: 4.75 * L },
        { id: l102b, share: 4.75 * L },
      ],
      4,
    );
    await rate(
      w102,
      opB,
      rqB,
      aB1,
      8,
      10.2 * L,
      [
        { id: l102, share: 5.1 * L },
        { id: l102b, share: 5.1 * L },
      ],
      3,
    );

    // W-103: quoted (shared, valid 24 h), two jets on the outbound leg for 18 guests.
    const w103 = await wedding({
      partner_id: p2,
      client_id: c3,
      venue_city: 'Udaipur',
      starts_on: day(14),
      ends_on: day(16),
      lead_source: 'PARTNER',
      status: 'QUOTED',
    });
    const l103a = await leg(w103, 1, 'BOM', 'UDR', day(13), 18, 'SUPER_MIDSIZE', 'QUOTED');
    const l103b = await leg(w103, 2, 'UDR', 'BOM', day(17), 18, 'SUPER_MIDSIZE', 'QUOTED', [
      '16:00',
      '19:00',
    ]);
    const r103a = await rate(
      w103,
      opB,
      null,
      aB2,
      10,
      14 * L,
      [
        { id: l103a, share: 7 * L },
        { id: l103b, share: 7 * L },
      ],
      30,
    );
    const r103b = await rate(
      w103,
      opB,
      null,
      aB1,
      8,
      12 * L,
      [
        { id: l103a, share: 6 * L },
        { id: l103b, share: 6 * L },
      ],
      30,
    );
    for (const l of [l103a, l103b])
      for (const r of [r103a, r103b])
        await ins(m, 'leg_choice', { leg_id: l, rate_response_id: r });
    await quote(
      w103,
      'SHARED',
      [
        {
          leg: l103a,
          rr: r103a,
          desc: 'Mumbai → Udaipur → Mumbai, Challenger 605 (10 seats), Operator B',
          input: tenPct(14 * L),
        },
        {
          leg: l103a,
          rr: r103b,
          desc: 'Mumbai → Udaipur → Mumbai, Citation XLS (8 seats), Operator B',
          input: tenPct(12 * L),
        },
      ],
      { basis: 'BOOKING_PERCENT', bps: 200 },
      { shared_at: hoursAgo(21), valid_until: new Date(now.getTime() + 3 * 3_600_000) },
    );

    // W-104: signed and paid; flies in 5 days, guest IDs still missing.
    const w104 = await wedding({
      partner_id: p1,
      client_id: c4,
      venue_city: 'Udaipur',
      starts_on: day(5),
      ends_on: day(7),
      lead_source: 'PARTNER',
      status: 'SIGNED_AND_PAID',
    });
    const l104a = await leg(w104, 1, 'DEL', 'UDR', day(5), 8, 'MIDSIZE', 'CONFIRMED');
    const l104b = await leg(w104, 2, 'UDR', 'DEL', day(7), 8, 'MIDSIZE', 'CONFIRMED', [
      '15:00',
      '18:00',
    ]);
    const r104 = await rate(
      w104,
      opA,
      null,
      aA1,
      8,
      9 * L,
      [
        { id: l104a, share: 4.5 * L },
        { id: l104b, share: 4.5 * L },
      ],
      200,
    );
    for (const l of [l104a, l104b])
      await ins(m, 'leg_choice', { leg_id: l, rate_response_id: r104 });
    const q104 = await quote(
      w104,
      'ACCEPTED',
      [
        {
          leg: l104a,
          rr: r104,
          desc: 'Delhi → Udaipur → Delhi, Hawker 800XP (8 seats), Operator A',
          input: tenPct(9 * L),
        },
        {
          leg: null,
          rr: null,
          desc: 'Floral welcome on board',
          input: { cost: 15_000_00, sell: 25_000_00 },
        },
      ],
      { basis: 'MARGIN_SHARE', bps: 2000 },
      { shared_at: hoursAgo(150), accepted_at: hoursAgo(120), accepted_name: 'Client C4' },
    );
    await ins(m, 'payment', {
      wedding_id: w104,
      direction: 'CLIENT_IN',
      amount: q104.totals.total,
      status: 'RECORDED',
      paid_on: day(-4),
      mode: 'BANK_TRANSFER',
      reference: 'FAKE-UTR-104',
      created_by: owner,
    });
    for (let i = 1; i <= 8; i++) {
      await ins(m, 'guest', {
        leg_id: l104a,
        name: `Guest G${i}`,
        phone: `+9193333333${String(i).padStart(2, '0')}`,
        id_received: i <= 2,
      });
    }

    // W-105: flying now; outbound flown yesterday, return tomorrow.
    const w105 = await wedding({
      client_id: c5,
      partner_id: h1,
      venue_city: 'Jodhpur',
      starts_on: day(-1),
      ends_on: day(1),
      lead_source: 'HOTEL',
      status: 'FLYING',
    });
    const l105a = await leg(w105, 1, 'DEL', 'JDH', day(-1), 6, 'TURBOPROP', 'FLOWN');
    const l105b = await leg(w105, 2, 'JDH', 'DEL', day(1), 6, 'TURBOPROP', 'CONFIRMED', [
      '11:00',
      '13:00',
    ]);
    const r105 = await rate(
      w105,
      opC,
      null,
      aC1,
      7,
      6 * L,
      [
        { id: l105a, share: 3 * L },
        { id: l105b, share: 3 * L },
      ],
      400,
    );
    for (const l of [l105a, l105b])
      await ins(m, 'leg_choice', { leg_id: l, rate_response_id: r105 });
    const q105 = await quote(
      w105,
      'ACCEPTED',
      [
        {
          leg: l105a,
          rr: r105,
          desc: 'Delhi → Jodhpur → Delhi, King Air B200 (7 seats), Operator C',
          input: tenPct(6 * L),
        },
      ],
      { basis: 'MARGIN_SHARE', bps: 2000 },
      { accepted_at: hoursAgo(300), accepted_name: 'Client C5' },
    );
    await ins(m, 'payment', {
      wedding_id: w105,
      direction: 'CLIENT_IN',
      amount: q105.totals.total,
      status: 'RECORDED',
      paid_on: day(-10),
      reference: 'FAKE-UTR-105',
      created_by: owner,
    });
    await ins(m, 'payment', {
      wedding_id: w105,
      direction: 'OPERATOR_OUT',
      operator_id: opC,
      amount: 6 * L,
      status: 'PAYABLE',
      payable_at: hoursAgo(200),
      created_by: owner,
    });
    for (let i = 1; i <= 6; i++)
      await ins(m, 'guest', { leg_id: l105b, name: `Guest J${i}`, id_received: true });

    // W-106: done last month; operator paid, partner commission paid.
    const w106 = await wedding({
      partner_id: p2,
      client_id: c6,
      venue_city: 'Goa',
      starts_on: day(-35),
      ends_on: day(-33),
      lead_source: 'PARTNER',
      status: 'DONE',
    });
    const l106a = await leg(w106, 1, 'BOM', 'GOX', day(-35), 8, 'MIDSIZE', 'FLOWN');
    const l106b = await leg(w106, 2, 'GOX', 'BOM', day(-33), 8, 'MIDSIZE', 'FLOWN', [
      '16:00',
      '18:00',
    ]);
    const r106 = await rate(
      w106,
      opB,
      null,
      aB1,
      8,
      7 * L,
      [
        { id: l106a, share: 3.5 * L },
        { id: l106b, share: 3.5 * L },
      ],
      1200,
    );
    for (const l of [l106a, l106b])
      await ins(m, 'leg_choice', { leg_id: l, rate_response_id: r106 });
    const q106 = await quote(
      w106,
      'ACCEPTED',
      [
        {
          leg: l106a,
          rr: r106,
          desc: 'Mumbai → Goa (Mopa) → Mumbai, Citation XLS (8 seats), Operator B',
          input: tenPct(7 * L),
        },
      ],
      { basis: 'BOOKING_PERCENT', bps: 200 },
      { accepted_at: hoursAgo(1300), accepted_name: 'Client C6' },
    );
    await ins(m, 'payment', {
      wedding_id: w106,
      direction: 'CLIENT_IN',
      amount: q106.totals.total,
      status: 'RECORDED',
      paid_on: day(-45),
      reference: 'FAKE-UTR-106',
      created_by: owner,
    });
    await ins(m, 'payment', {
      wedding_id: w106,
      direction: 'OPERATOR_OUT',
      operator_id: opB,
      amount: 7 * L,
      status: 'PAID',
      paid_on: day(-30),
      reference: 'FAKE-UTR-106-OP',
      created_by: owner,
    });
    await ins(m, 'payment', {
      wedding_id: w106,
      direction: 'PARTNER_OUT',
      partner_id: p2,
      amount: q106.totals.commission,
      status: 'PAID',
      paid_on: day(-28),
      reference: 'FAKE-UTR-106-P2',
      created_by: owner,
    });
  });

  const counts: Record<string, number> = {};
  for (const t of [
    'partner',
    'client',
    'operator',
    'aircraft',
    'wedding',
    'leg',
    'rate_response',
    'quote',
    'payment',
    'guest',
  ]) {
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM ${t}`);
    counts[t] = row.n;
  }
  return { owner: SEED_OWNER, counts };
}
