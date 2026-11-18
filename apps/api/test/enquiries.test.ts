import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EnquiriesService } from '../src/enquiries/enquiries.service.js';
import { ConsentService } from '../src/clients/consent.service.js';
import { PartnersService } from '../src/partners/partners.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const HOUR = 3_600_000;

const family = {
  name: 'Asha Mehra',
  phone: '98100 00001',
  email: 'asha@example.test',
  role: 'family',
  weddingCity: 'Udaipur',
  weddingDate: '2026-12-10',
  guestsFrom: '18 from Delhi, 6 from Mumbai, 2 from Paris',
  guests: 26,
  message: 'Sangeet on the 9th evening',
  consent: true,
  page: '/routes/delhi-to-udaipur',
  utmSource: 'google',
  utmMedium: 'cpc',
  utmCampaign: 'delhi-udaipur',
  gclid: 'Cj0KCQ-test',
  companyWebsite: '',
  elapsedMs: 41_000,
};

describe('website enquiries (public endpoints)', () => {
  let t: TestApp;
  let now: Date;
  let token: string;
  const post = (path: string, body: object) => t.http().post(`/api/public/${path}`).send(body);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    now = NOW;
    for (const svc of [EnquiriesService, ConsentService, PartnersService])
      (t.app.get(svc) as { now: () => Date }).now = () => now;
    await createOwner(t.ds, { setupDone: true });
    token = (await login(t)).accessToken;
  });

  const weddings = () =>
    t.ds.query(
      `SELECT id, status, lead_source, utm_source, utm_medium, utm_campaign, landing_page, venue_city,
              starts_on::text, client_id, partner_id, notes, created_by FROM wedding ORDER BY number`,
    );

  it('turns a family enquiry into a wedding with client, consent, lead source and draft legs', async () => {
    expect((await post('enquiries', family).expect(201)).body).toEqual({ ok: true });

    const [w] = await weddings();
    expect(w).toMatchObject({
      status: 'ENQUIRY',
      lead_source: 'GOOGLE_ADS',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'delhi-udaipur',
      landing_page: '/routes/delhi-to-udaipur',
      venue_city: 'Udaipur',
      starts_on: '2026-12-10',
      partner_id: null,
      created_by: null,
    });
    expect(w.notes).toContain('Website enquiry from Asha Mehra (Family)');
    expect(w.notes).toContain('Sangeet on the 9th evening');

    const [c] = await t.ds.query(`SELECT id, name, phone, email, type FROM client`);
    expect(c).toMatchObject({ name: 'Asha Mehra', phone: '+919810000001', type: 'FAMILY' });
    expect(w.client_id).toBe(c.id);
    const consents = await t.ds.query(`SELECT subject_type, subject_id, source FROM consent`);
    expect(consents).toEqual([
      { subject_type: 'CLIENT', subject_id: c.id, source: 'WEBSITE_FORM' },
    ]);

    // Delhi and Mumbai are clear; Paris is not one of our airports. Day before the wedding.
    const legs = await t.ds.query(
      `SELECT from_iata, to_iata, flight_date::text AS date, pax, status FROM leg ORDER BY seq`,
    );
    expect(legs).toEqual([
      { from_iata: 'DEL', to_iata: 'UDR', date: '2026-12-09', pax: 18, status: 'OPEN' },
      { from_iata: 'BOM', to_iata: 'UDR', date: '2026-12-09', pax: 6, status: 'OPEN' },
    ]);

    const [e] = await t.ds.query(`SELECT * FROM enquiry`);
    expect(e).toMatchObject({
      source: 'WEBSITE',
      honeypot_hit: false,
      wedding_id: w.id,
      client_id: c.id,
    });
    expect(e.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(e)).not.toContain('127.0.0.1');
    expect(e.payload).not.toHaveProperty('companyWebsite');
    expect(e.payload).not.toHaveProperty('consent');

    // Audited as the website visitor.
    const audit = await t.ds.query(
      `SELECT DISTINCT actor_type FROM audit_log WHERE entity IN ('wedding', 'client', 'consent')`,
    );
    expect(audit).toEqual([{ actor_type: 'PUBLIC' }]);
  });

  it('needs consent, a name and a phone number, with plain messages', async () => {
    const res = await post('enquiries', {
      ...family,
      consent: false,
      phone: '',
      name: '',
      role: 'cousin',
    }).expect(400);
    expect(res.body.fields).toMatchObject({
      consent: 'Please tick the box so we can contact you about your enquiry',
      phone: 'Enter your WhatsApp number',
      name: 'Enter your name',
      role: 'Choose family, planner or hotel',
    });
    expect(
      (await post('enquiries', { ...family, weddingDate: '2026-11-01' }).expect(400)).body.fields,
    ).toEqual({
      weddingDate: 'Choose a date from today on',
    });
    expect(await weddings()).toEqual([]);
  });

  it('answers bots exactly like people but keeps them out of the desk', async () => {
    expect(
      (await post('enquiries', { ...family, companyWebsite: 'http://spam.example' }).expect(201))
        .body,
    ).toEqual({ ok: true });
    expect((await post('enquiries', { ...family, elapsedMs: 900 }).expect(201)).body).toEqual({
      ok: true,
    });
    expect(await weddings()).toEqual([]);
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM client`)).toEqual([{ n: 0 }]);
    const rows = await t.ds.query(
      `SELECT honeypot_hit, spam_reason, wedding_id FROM enquiry ORDER BY created_at, spam_reason`,
    );
    expect(rows).toEqual([
      { honeypot_hit: true, spam_reason: 'HONEYPOT', wedding_id: null },
      { honeypot_hit: true, spam_reason: 'TOO_FAST', wedding_id: null },
    ]);
  });

  it('joins a repeat submission to the first wedding, and starts a new one a day later', async () => {
    await post('enquiries', family).expect(201);
    await post('enquiries', { ...family, message: 'Sorry, sent twice' }).expect(201);
    expect(await weddings()).toHaveLength(1);
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM enquiry`)).toEqual([{ n: 2 }]);

    const [w] = await weddings();
    const block = (
      await t
        .http()
        .get(`/api/weddings/${w.id}/enquiry`)
        .set('authorization', `Bearer ${token}`)
        .expect(200)
    ).body.enquiry;
    expect(block).toMatchObject({
      name: 'Asha Mehra',
      role: 'FAMILY',
      guests: 26,
      guestsFrom: '18 from Delhi, 6 from Mumbai, 2 from Paris',
      page: '/routes/delhi-to-udaipur',
      gclid: true,
      repeats: 1,
    });

    now = new Date(NOW.getTime() + 25 * HOUR);
    await post('enquiries', family).expect(201);
    const all = await weddings();
    expect(all).toHaveLength(2);
    // Same family: one client, consent recorded each time.
    expect(new Set(all.map((x: { client_id: string }) => x.client_id)).size).toBe(1);
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM consent`)).toEqual([{ n: 2 }]);
  });

  it('matches an existing client by phone and fills a missing email', async () => {
    const [c] = await t.ds.query(
      `INSERT INTO client (type, name, phone) VALUES ('FAMILY', 'Mehra family', '+919810000001') RETURNING id`,
    );
    await post('enquiries', family).expect(201);
    expect(await t.ds.query(`SELECT name, email FROM client`)).toEqual([
      { name: 'Mehra family', email: 'asha@example.test' },
    ]);
    expect((await weddings())[0].client_id).toBe(c.id);
  });

  it('links planner enquiries to the partner, creating one to follow up today', async () => {
    const res = await post('enquiries', { ...family, role: 'planner', firm: '' }).expect(400);
    expect(res.body.fields).toEqual({ firm: 'Enter your firm or hotel name' });

    await post('enquiries', {
      ...family,
      role: 'planner',
      firm: 'Planner Q1',
      utmSource: 'instagram',
      utmMedium: 'social',
      gclid: null,
    }).expect(201);
    const [p] = await t.ds.query(
      `SELECT id, firm, contact_person, type, status, next_follow_up_on::text AS f FROM partner`,
    );
    expect(p).toMatchObject({
      firm: 'Planner Q1',
      contact_person: 'Asha Mehra',
      type: 'PLANNER',
      status: 'CONTACTED',
      f: '2026-11-18',
    });
    const [w] = await weddings();
    expect(w).toMatchObject({ partner_id: p.id, client_id: null, lead_source: 'INSTAGRAM' });

    // The same planner again (another wedding): matched, not duplicated.
    await post('enquiries', {
      ...family,
      role: 'planner',
      firm: 'Planner Q1',
      weddingCity: 'Jaipur',
    }).expect(201);
    expect(await t.ds.query(`SELECT count(*)::int AS n FROM partner`)).toEqual([{ n: 1 }]);
    expect(await weddings()).toHaveLength(2);
    expect(await t.ds.query(`SELECT kind FROM partner_activity`)).toHaveLength(2);
  });

  it('signs up partners from the planners page without duplicating ones we already have', async () => {
    const signup = {
      name: 'Ravi Kapoor',
      firm: 'Hotel H2',
      role: 'hotel',
      city: 'Jaipur',
      phone: '98290 00002',
      email: 'weddings@hotel-h2.example.test',
      weddingsPerYear: 40,
      message: 'We host 40 weddings a year',
      consent: true,
      page: '/for-planners',
      elapsedMs: 30_000,
    };
    await post('partners', signup).expect(201);
    const [p] = await t.ds.query(
      `SELECT id, firm, type, status, city, next_follow_up_on::text AS f FROM partner`,
    );
    expect(p).toMatchObject({
      firm: 'Hotel H2',
      type: 'HOTEL',
      status: 'CONTACTED',
      city: 'Jaipur',
      f: '2026-11-18',
    });
    const [a] = await t.ds.query(`SELECT kind, note FROM partner_activity`);
    expect(a.note).toContain('Signed up as a partner on the website. Weddings a year: 40.');
    expect(await t.ds.query(`SELECT source FROM consent WHERE subject_type = 'PARTNER'`)).toEqual([
      { source: 'WEBSITE_FORM' },
    ]);

    // An imported partner with this email signs up: same record, moves to Contacted.
    await t.ds.query(
      `INSERT INTO partner (type, firm, email, status, commission_basis, commission_bps)
       VALUES ('PLANNER', 'Planner P7', 'hello@p7.example.test', 'IMPORTED', 'MARGIN_SHARE', 2000)`,
    );
    await post('partners', {
      ...signup,
      firm: 'P7 Weddings',
      role: 'planner',
      phone: '98290 00003',
      email: 'hello@p7.example.test',
    }).expect(201);
    expect(
      await t.ds.query(
        `SELECT firm, status, next_follow_up_on::text AS f FROM partner ORDER BY firm`,
      ),
    ).toEqual([
      { firm: 'Hotel H2', status: 'CONTACTED', f: '2026-11-18' },
      { firm: 'Planner P7', status: 'CONTACTED', f: '2026-11-18' },
    ]);
  });

  it('counts WhatsApp and call taps sent with sendBeacon, by lead source', async () => {
    await t
      .http()
      .post('/api/public/events')
      .set('content-type', 'text/plain;charset=UTF-8')
      .send(JSON.stringify({ kind: 'WHATSAPP', page: '/', utmSource: 'google', utmMedium: 'cpc' }))
      .expect(204);
    await post('events', { kind: 'WHATSAPP', page: '/routes/mumbai-to-goa' }).expect(204);
    await post('events', { kind: 'CALL', page: '/contact' }).expect(204);
    await t
      .http()
      .post('/api/public/events')
      .set('content-type', 'text/plain')
      .send('not json')
      .expect(400);
    await post('events', { kind: 'SMS' }).expect(400);
    await post('enquiries', family).expect(201);
    await post('enquiries', family).expect(201); // repeat: not counted twice
    await post('enquiries', { ...family, companyWebsite: 'x' }).expect(201);

    const s = (
      await t
        .http()
        .get('/api/enquiries/summary?days=7')
        .set('authorization', `Bearer ${token}`)
        .expect(200)
    ).body;
    expect(s).toEqual({
      days: 7,
      enquiries: 1,
      partnerSignups: 0,
      whatsappTaps: 2,
      callTaps: 1,
      spamCaught: 1,
      bySource: { GOOGLE_ADS: { enquiries: 1, taps: 1 }, WEBSITE: { enquiries: 0, taps: 2 } },
    });
    await t.http().get('/api/enquiries/summary').expect(401);
  });

  it('lets only the website call the public endpoints from a browser, without cookies', async () => {
    const pre = await t
      .http()
      .options('/api/public/enquiries')
      .set('origin', 'http://localhost:4321')
      .set('access-control-request-method', 'POST')
      .set('access-control-request-headers', 'content-type');
    expect(pre.status).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('http://localhost:4321');
    expect(pre.headers['access-control-allow-credentials']).toBeUndefined();

    const evil = await t
      .http()
      .options('/api/public/enquiries')
      .set('origin', 'https://evil.example')
      .set('access-control-request-method', 'POST');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    // The website's origin gets nothing from the desk's endpoints.
    const desk = await t.http().get('/api/weddings').set('origin', 'http://localhost:4321');
    expect(desk.headers['access-control-allow-origin']).not.toBe('http://localhost:4321');
  });

  it('rate-limits each network', async () => {
    for (let i = 0; i < 8; i++)
      await post('enquiries', { ...family, companyWebsite: 'x' }).expect(201);
    const res = await post('enquiries', family).expect(429);
    expect(res.body.message).toMatch(/Too many requests/);
    // Taps have their own, separate limit.
    await post('events', { kind: 'WHATSAPP' }).expect(204);
  });
});
