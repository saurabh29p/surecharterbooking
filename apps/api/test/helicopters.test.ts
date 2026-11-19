import { findLeaks, hourlyInternalAmounts } from '@shubhjets/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionService } from '../src/crypto/encryption.service.js';
import { SEED_OWNER, seed } from '../src/db/seed-data.js';
import { AgreementsService } from '../src/documents/agreements.service.js';
import { DocumentsService } from '../src/documents/documents.service.js';
import { TemplatesService } from '../src/documents/templates.service.js';
import { OperatorsService } from '../src/operators/operators.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { renderQuoteHtml } from '../src/quotes/quote-template.js';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { RatesService } from '../src/weddings/rates.service.js';
import { createTestApp, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';
import { PDF } from './fixtures.js';

const NOW = new Date('2026-11-18T06:00:00Z');
const L = 1_00_000_00;

const HELIPAD = {
  name: 'Lake Palace helipad',
  city: 'Udaipur',
  mapUrl: 'https://maps.example.com/?q=lake-palace-helipad',
};
const HELI_LEG = {
  from: 'UDR',
  to: 'UDR',
  toSite: HELIPAD,
  date: '2026-12-13',
  windowFrom: '16:00',
  windowTo: '17:00',
  pax: 2,
  category: 'HELICOPTER_TWIN',
  serviceType: 'BRIDE_GROOM_ENTRY',
};
const PRICING = {
  hourlyRate: 2.4 * L,
  flyingMinutes: 30,
  positioning: 60_000_00,
  waiting: 25_000_00,
};

describe('helicopters: venue legs, permissions, hourly rates', () => {
  let t: TestApp;
  let token: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await seed(t.ds, t.app.get(EncryptionService), NOW);
    for (const svc of [
      RatesService,
      OperatorsService,
      PaymentsService,
      QuotesService,
      TemplatesService,
      AgreementsService,
      DocumentsService,
    ])
      (t.app.get(svc) as { now: () => Date }).now = () => NOW;
    token = (await t.http().post('/api/auth/login').send(SEED_OWNER)).body.accessToken;
    for (const r of await t.ds.query(
      `SELECT code AS k, id FROM wedding UNION ALL SELECT brand, id FROM operator`,
    ))
      ids[r.k] = r.id;
    // Operator A (verified) also flies a twin-engine helicopter from Udaipur.
    await t.ds.query(
      `INSERT INTO aircraft (operator_id, type, registration, category, seats, year, base_airport)
       VALUES ($1, 'Bell 412', 'VT-ZZ8', 'HELICOPTER_TWIN', 6, 2015, 'UDR')`,
      [ids['Operator A']],
    );
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const heliAircraft = async () =>
    (await t.ds.query(`SELECT id FROM aircraft WHERE registration = 'VT-ZZ8'`))[0].id as string;
  const addLeg = (code: string, body: object) =>
    authed(t.http().post(`/api/weddings/${ids[code]}/legs`)).send(body);
  const tick = (legId: string, key: string, done = true) =>
    authed(t.http().put(`/api/legs/${legId}/heli-checks`)).send({ key, done });

  describe('legs', () => {
    it('keeps venues, helipads and services to helicopter legs', async () => {
      const jet = await addLeg('W-101', { ...HELI_LEG, category: 'MIDSIZE', to: 'DEL' }).expect(
        400,
      );
      expect(JSON.stringify(jet.body)).toContain('Venues and helipads are for helicopter legs');
      const same = await addLeg('W-101', { ...HELI_LEG, toSite: null }).expect(400);
      expect(JSON.stringify(same.body)).toContain(
        'Arrival must differ from departure, or name the venue or helipad',
      );

      const leg = (await addLeg('W-101', HELI_LEG).expect(201)).body;
      expect(leg).toMatchObject({
        fromIata: 'UDR',
        toIata: 'UDR',
        fromSite: null,
        toSite: HELIPAD,
        serviceType: 'BRIDE_GROOM_ENTRY',
        heliChecks: {},
      });
      // Turning it into a jet leg while it still lands at the helipad is refused.
      await authed(t.http().patch(`/api/legs/${leg.id}`))
        .send({ category: 'MIDSIZE' })
        .expect(400);
    });

    it('suggests only helicopter operators for a helicopter leg', async () => {
      const leg = (await addLeg('W-101', HELI_LEG).expect(201)).body;
      const list = (await authed(t.http().get(`/api/legs/${leg.id}/suggestions`)).expect(200)).body;
      expect(list.map((s: { name: string }) => s.name)).toEqual(['Operator A']);
    });

    it('ticks permissions; flower-shower approval only for a flower shower', async () => {
      const leg = (await addLeg('W-101', HELI_LEG).expect(201)).body;
      const no = await tick(leg.id, 'flowerShower').expect(409);
      expect(no.body.message).toBe('Flower-shower approval is only needed for a flower shower');
      const done = (await tick(leg.id, 'landingSite').expect(200)).body;
      expect(done.heliChecks.landingSite).toMatchObject({ done: true });
      const [jetLeg] = await t.ds.query(
        `SELECT l.id FROM leg l JOIN wedding w ON w.id = l.wedding_id WHERE w.code = 'W-101' AND l.seq = 1`,
      );
      await tick(jetLeg.id, 'landingSite').expect(409);
    });
  });

  describe('rates', () => {
    it('asks the operator with the helipad, the map link and hourly terms', async () => {
      await addLeg('W-101', HELI_LEG).expect(201);
      const res = (
        await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-requests`))
          .send({ operatorIds: [ids['Operator A']] })
          .expect(201)
      ).body;
      const text: string = res.messages?.[0]?.message ?? res[0]?.message ?? JSON.stringify(res);
      expect(text).toContain('Bride/groom helicopter entry: Udaipur (UDR) → Lake Palace helipad');
      expect(text).toContain(`map: ${HELIPAD.mapUrl}, nearest airport UDR`);
      expect(text).toContain('rate per flying hour, flying time, positioning and waiting');
      // Never the client's name.
      expect(text).not.toMatch(/Client C\d/);
    });

    it('works out the net from the hourly rate, flying time, positioning and waiting', async () => {
      const leg = (await addLeg('W-101', HELI_LEG).expect(201)).body;
      const base = {
        operatorId: ids['Operator A'],
        aircraftId: await heliAircraft(),
        legIds: [leg.id],
        pricing: PRICING,
      };
      const reply = (
        await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-responses`))
          .send(base)
          .expect(201)
      ).body;
      const o = (await authed(t.http().get(`/api/weddings/${ids['W-101']}/rates`)).expect(200))
        .body;
      const shown = o.replies.find((r: { id: string }) => r.id === reply.id);
      expect(shown).toMatchObject({ netRate: 1.2 * L + 85_000_00, pricing: PRICING });

      const wrong = await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-responses`))
        .send({ ...base, netRate: 1 * L })
        .expect(400);
      expect(JSON.stringify(wrong.body)).toContain('rate × flying time + positioning + waiting');

      const [jetLeg] = await t.ds.query(
        `SELECT l.id FROM leg l JOIN wedding w ON w.id = l.wedding_id WHERE w.code = 'W-101' AND l.seq = 1`,
      );
      const jet = await authed(t.http().post(`/api/weddings/${ids['W-101']}/rate-responses`))
        .send({ ...base, aircraftId: null, aircraftText: 'Jet', legIds: [jetLeg.id] })
        .expect((r) => expect([400, 409]).toContain(r.status));
      expect(JSON.stringify(jet.body)).toContain('Hourly pricing is for helicopter legs');
    });
  });

  describe('quote', () => {
    it('shows the client one price per service: venue and service, never the hourly figures', async () => {
      const w = (
        await authed(t.http().post('/api/weddings'))
          .send({
            newClient: {
              name: 'Client C9 Family',
              phone: '98765 43210',
              consentSource: 'WHATSAPP',
            },
            venueCity: 'Udaipur',
            startsOn: '2026-12-12',
            endsOn: '2026-12-14',
            legs: [HELI_LEG],
          })
          .expect(201)
      ).body;
      const [leg] = await t.ds.query(`SELECT id FROM leg WHERE wedding_id = $1`, [w.id]);
      const reply = (
        await authed(t.http().post(`/api/weddings/${w.id}/rate-responses`))
          .send({
            operatorId: ids['Operator A'],
            aircraftId: await heliAircraft(),
            legIds: [leg.id],
            pricing: PRICING,
          })
          .expect(201)
      ).body;
      await authed(t.http().put(`/api/legs/${leg.id}/choices`))
        .send({ rateResponseIds: [reply.id] })
        .expect(204);
      const q = (await authed(t.http().post(`/api/weddings/${w.id}/quotes`)).expect(201)).body;
      await authed(t.http().post(`/api/quotes/${q.id}/issue`))
        .send({ confirmLooser: false })
        .expect(200);
      const [row] = await t.ds.query(`SELECT snapshot FROM quote WHERE id = $1`, [q.id]);
      const outLeg = row.snapshot.legs[0];
      expect(outLeg).toMatchObject({
        toSite: HELIPAD,
        service: 'Bride/groom helicopter entry',
      });
      const json = JSON.stringify(row.snapshot).toLowerCase();
      for (const word of ['hourly', 'pricing', 'flyingminutes', 'positioning', 'waiting'])
        expect(json).not.toContain(word);

      const svc = t.app.get(QuotesService);
      const figures = await svc.internalFigures(t.ds.manager, await svc.find(q.id));
      const internal = figures.amounts.map((a) => a.paise);
      for (const a of hourlyInternalAmounts(PRICING)) expect(internal).toContain(a);
      const html = renderQuoteHtml(row.snapshot);
      expect(html).toContain('Lake Palace helipad');
      expect(html).toContain('Bride/groom helicopter entry');
      // Amounts only: the issue step above already ran the full guard (the cancellation table shows "10%").
      const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
      const shown = [
        row.snapshot.subtotal,
        row.snapshot.total,
        row.snapshot.gst.total,
        row.snapshot.gst.cgst,
        row.snapshot.gst.sgst,
        row.snapshot.gst.igst,
        outLeg.price,
        ...outLeg.lines.map((x: { price: number }) => x.price),
      ].filter((v) => typeof v === 'number');
      expect(findLeaks(text, { ...figures, percents: [], allowedAmounts: shown })).toEqual([]);
    }, 30_000);
  });

  describe('confirming', () => {
    async function readyW103() {
      const [q] = await t.ds.query(`SELECT id FROM quote WHERE wedding_id = $1`, [ids['W-103']]);
      await authed(t.http().post(`/api/quotes/${q.id}/accept`))
        .send({ name: 'Client C3' })
        .expect(200);
      const tpl = (await authed(t.http().get('/api/templates/client-terms')).expect(200)).body;
      if (!tpl.current.lawyerApproved)
        await authed(
          t.http().post(`/api/templates/client-terms/versions/${tpl.current.id}/approve`),
        )
          .send({ approvedOn: '2026-11-17' })
          .expect(200);
      const doc = (
        await authed(t.http().post('/api/agreements'))
          .send({ kind: 'CLIENT_TERMS', weddingId: ids['W-103'] })
          .expect(201)
      ).body;
      await authed(t.http().post(`/api/documents/${doc.documentId}/signed`))
        .attach('file', PDF, 's.pdf')
        .expect(204);
      const m = (await authed(t.http().get(`/api/weddings/${ids['W-103']}/money`)).expect(200))
        .body;
      await authed(t.http().post(`/api/weddings/${ids['W-103']}/payments`))
        .send({ direction: 'CLIENT_IN', amount: m.position.total, paidOn: '2026-11-17' })
        .expect(201);
    }

    it('cannot confirm until every helicopter permission is in, and keeps them on Today', async () => {
      // A flower shower over the venue, added to W-103 (quoted).
      const [leg] = await t.ds.query(
        `INSERT INTO leg (wedding_id, seq, from_iata, to_iata, flight_date, pax, category, status, to_site, service_type)
         SELECT id, 3, 'UDR', 'UDR', '2026-11-25', 2, 'HELICOPTER_SINGLE', 'QUOTED', $2, 'FLOWER_SHOWER'
           FROM wedding WHERE id = $1 RETURNING id`,
        [ids['W-103'], JSON.stringify(HELIPAD)],
      );
      await readyW103();

      const today = (await authed(t.http().get('/api/today')).expect(200)).body;
      const action = today.actions.find((a: { kind: string }) => a.kind === 'HELI_PERMISSIONS');
      expect(action).toMatchObject({
        title: 'W-103: helicopter leg 3 needs 4 permissions',
        urgency: 'NOW',
      });

      const money = (await authed(t.http().get(`/api/weddings/${ids['W-103']}/money`)).expect(200))
        .body;
      expect(money.canConfirm).toBe(false);
      expect(money.checklist.at(-1)).toMatchObject({ key: 'helicopter', done: false });
      const res = await authed(t.http().post(`/api/weddings/${ids['W-103']}/confirm`)).expect(409);
      expect(res.body.missing).toEqual(['helicopter']);
      expect(res.body.message).toContain('Leg 3: Flower-shower approval');

      for (const key of ['landingSite', 'localPermission', 'flowerShower', 'weatherBackup'])
        await tick(leg.id, key).expect(200);
      const after = (await authed(t.http().get('/api/today')).expect(200)).body;
      expect(after.actions.some((a: { kind: string }) => a.kind === 'HELI_PERMISSIONS')).toBe(
        false,
      );
      await authed(t.http().post(`/api/weddings/${ids['W-103']}/confirm`)).expect(204);
    });
  });
});
