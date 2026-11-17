import { fakeGstin } from '@shubhjets/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BusinessProfilesService } from '../src/business-profiles/business-profiles.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const DELHI_GSTIN = fakeGstin('07', 'AAAFZ1234Q');
const HARYANA_GSTIN = fakeGstin('06', 'AAAFZ1234Q');
const BANK = {
  accountName: 'Example LLP',
  accountNumber: '1234 5678 9012',
  ifsc: 'hdfc0001234',
  bankName: 'Example Bank',
};

describe('business profiles', () => {
  let t: TestApp;
  let token: string;
  let ownerId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    ownerId = await createOwner(t.ds);
    token = (await login(t)).accessToken;
  });

  const api = {
    list: () => t.http().get('/api/business-profiles').set('authorization', `Bearer ${token}`),
    create: (body: object) =>
      t.http().post('/api/business-profiles').set('authorization', `Bearer ${token}`).send(body),
    update: (id: string, body: object) =>
      t
        .http()
        .patch(`/api/business-profiles/${id}`)
        .set('authorization', `Bearer ${token}`)
        .send(body),
    makeDefault: (id: string) =>
      t.http().post(`/api/business-profiles/${id}/default`).set('authorization', `Bearer ${token}`),
    archive: (id: string) =>
      t.http().post(`/api/business-profiles/${id}/archive`).set('authorization', `Bearer ${token}`),
    bank: (id: string) =>
      t
        .http()
        .get(`/api/business-profiles/${id}/bank-details`)
        .set('authorization', `Bearer ${token}`),
  };

  it('needs login', async () => {
    await t.http().get('/api/business-profiles').expect(401);
  });

  describe('setup wizard: every field is optional', () => {
    it('creates an empty profile, defaulting to Delhi, as the default profile', async () => {
      const res = await api.create({}).expect(201);
      expect(res.body).toMatchObject({
        label: 'Delhi',
        stateCode: '07',
        isDefault: true,
        invoicePrefix: 'SJ',
        gstin: null,
      });
      expect(res.body.readiness.missing).toEqual([
        'gstin',
        'llpin',
        'signatory',
        'bankDetails',
        'registeredAddress',
      ]);
      expect(res.body.readiness.canIssueInvoice).toBe(false);
    });

    it('fills in later, step by step, and clears a field with an empty string', async () => {
      const { body: p } = await api.create({ brandName: 'ShubhJets' }).expect(201);
      await api
        .update(p.id, {
          legalName: 'Example Exim LLP',
          llpin: 'aab-1234',
          gstin: DELHI_GSTIN.toLowerCase(),
        })
        .expect(200);
      await api
        .update(p.id, {
          registeredAddress: '1 Example Road, New Delhi',
          signatoryName: 'Partner One',
          signatoryDesignation: 'Designated Partner',
        })
        .expect(200);
      const done = await api
        .update(p.id, { bankDetails: BANK, arbitrationSeatCity: 'New Delhi' })
        .expect(200);
      expect(done.body).toMatchObject({
        llpin: 'AAB-1234',
        gstin: DELHI_GSTIN,
        hasBankDetails: true,
        bankHint: 'Example Bank ••••9012',
      });
      expect(done.body.readiness).toEqual({
        missing: [],
        warnings: [],
        canIssueInvoice: true,
        invoiceBlockers: [],
      });
      const cleared = await api.update(p.id, { llpin: '' }).expect(200);
      expect(cleared.body.llpin).toBeNull();
      expect(cleared.body.readiness.warnings).toEqual(['LLPIN is missing']);
    });
  });

  describe('validation', () => {
    it('explains bad values field by field', async () => {
      const res = await api
        .create({
          gstin: '07ABC',
          llpin: '1234',
          invoicePrefix: 'S/J',
          bankDetails: { ...BANK, ifsc: 'XX' },
        })
        .expect(400);
      expect(Object.keys(res.body.fields).sort()).toEqual([
        'bankDetails.ifsc',
        'gstin',
        'invoicePrefix',
        'llpin',
      ]);
    });

    it("refuses a GSTIN from another state than the profile's", async () => {
      const res = await api.create({ gstin: HARYANA_GSTIN }).expect(400);
      expect(res.body.fields.gstin).toBe(
        "This GSTIN is registered in Haryana, but the profile's state is Delhi",
      );
      await api.create({ gstin: HARYANA_GSTIN, stateCode: '06', label: 'Haryana' }).expect(201);
    });

    it('checks a GSTIN update against the stored state, and a state change against the stored GSTIN', async () => {
      const { body: p } = await api.create({ gstin: DELHI_GSTIN }).expect(201);
      const a = await api.update(p.id, { gstin: HARYANA_GSTIN }).expect(400);
      expect(a.body.fields.gstin).toMatch(/Haryana/);
      const b = await api.update(p.id, { stateCode: '06' }).expect(400);
      expect(b.body.fields.stateCode).toMatch(/change the GSTIN too/);
      await api.update(p.id, { stateCode: '06', gstin: HARYANA_GSTIN }).expect(200);
    });

    it('does not allow the same GSTIN on two active profiles', async () => {
      await api.create({ gstin: DELHI_GSTIN }).expect(201);
      const res = await api.create({ gstin: DELHI_GSTIN, label: 'Copy' }).expect(400);
      expect(res.body.fields.gstin).toMatch(/already used by the "Delhi" profile/);
    });
  });

  describe('several profiles, one default', () => {
    it('keeps the first as default and can switch', async () => {
      const { body: delhi } = await api.create({}).expect(201);
      const { body: haryana } = await api.create({ label: 'Haryana', stateCode: '06' }).expect(201);
      expect(haryana.isDefault).toBe(false);
      await api.makeDefault(haryana.id).expect(200);
      const list = (await api.list().expect(200)).body;
      expect(
        list.map((p: { label: string; isDefault: boolean }) => [p.label, p.isDefault]),
      ).toEqual([
        ['Haryana', true],
        ['Delhi', false],
      ]);
      expect(delhi.id).toBeDefined();
    });

    it('cannot archive the default; archived profiles drop out of the list', async () => {
      const { body: delhi } = await api.create({}).expect(201);
      const { body: other } = await api.create({ label: 'Other', stateCode: '27' }).expect(201);
      const res = await api.archive(delhi.id).expect(409);
      expect(res.body.message).toMatch(/Make another profile the default/);
      await api.archive(other.id).expect(200);
      expect((await api.list()).body).toHaveLength(1);
      await api.makeDefault(other.id).expect(400);
    });
  });

  describe('bank details', () => {
    it('are encrypted at rest, masked in normal responses and revealed only on request (audited)', async () => {
      const { body: p } = await api.create({ bankDetails: BANK }).expect(201);
      expect(JSON.stringify(p)).not.toContain('123456789012');
      const [raw] = await t.ds.query(
        `SELECT bank_details_enc FROM business_profile WHERE id = $1`,
        [p.id],
      );
      expect(Buffer.from(raw.bank_details_enc).toString('latin1')).not.toContain('123456789012');
      const revealed = await api.bank(p.id).expect(200);
      expect(revealed.body.bankDetails).toMatchObject({
        accountNumber: '123456789012',
        ifsc: 'HDFC0001234',
      });
      const audit: { action: string; diff: unknown }[] = await t.ds.query(
        `SELECT action, diff FROM audit_log WHERE entity = 'business_profile' ORDER BY id`,
      );
      expect(audit.map((a) => a.action)).toEqual(['CREATED', 'BANK_DETAILS_VIEWED']);
      expect(JSON.stringify(audit)).not.toContain('123456789012');
    });

    it('can be removed', async () => {
      const { body: p } = await api.create({ bankDetails: BANK }).expect(201);
      const res = await api.update(p.id, { bankDetails: null }).expect(200);
      expect(res.body).toMatchObject({ hasBankDetails: false, bankHint: null });
      expect((await api.bank(p.id)).body.bankDetails).toBeNull();
    });
  });

  it('audits field changes with before and after values', async () => {
    const { body: p } = await api.create({ brandName: 'Old' }).expect(201);
    await api.update(p.id, { brandName: 'New' }).expect(200);
    const [row] = await t.ds.query(`SELECT actor_id, diff FROM audit_log WHERE action = 'UPDATED'`);
    expect(row.actor_id).toBe(ownerId);
    expect(row.diff).toEqual({ brandName: { from: 'Old', to: 'New' } });
  });

  describe('invoice numbers', () => {
    it('run per profile, reset each financial year, and need GSTIN + address', async () => {
      const svc = t.app.get(BusinessProfilesService);
      const { body: delhi } = await api.create({}).expect(201);
      await expect(
        t.ds.transaction((m) => svc.nextInvoiceNumber(m, delhi.id, '2026-12-12')),
      ).rejects.toThrow(/Add the GSTIN.*Add the registered address/);
      await api
        .update(delhi.id, { gstin: DELHI_GSTIN, registeredAddress: '1 Example Road, New Delhi' })
        .expect(200);
      const { body: haryana } = await api
        .create({
          label: 'Haryana',
          stateCode: '06',
          gstin: HARYANA_GSTIN,
          registeredAddress: '2 Example Road, Gurugram',
          invoicePrefix: 'SJHR',
        })
        .expect(201);
      const next = (id: string, date: string) =>
        t.ds.transaction((m) => svc.nextInvoiceNumber(m, id, date));
      expect((await next(delhi.id, '2026-12-12')).number).toBe('SJ/2026-27/0001');
      expect((await next(delhi.id, '2027-03-31')).number).toBe('SJ/2026-27/0002');
      expect((await next(haryana.id, '2027-01-05')).number).toBe('SJHR/2026-27/0001');
      expect((await next(delhi.id, '2027-04-01')).number).toBe('SJ/2027-28/0001');
    });

    it('do not burn a number when the invoice transaction fails', async () => {
      const svc = t.app.get(BusinessProfilesService);
      const { body: p } = await api
        .create({ gstin: DELHI_GSTIN, registeredAddress: 'Somewhere' })
        .expect(201);
      await expect(
        t.ds.transaction(async (m) => {
          await svc.nextInvoiceNumber(m, p.id, '2026-12-12');
          throw new Error('PDF failed');
        }),
      ).rejects.toThrow('PDF failed');
      expect(
        (await t.ds.transaction((m) => svc.nextInvoiceNumber(m, p.id, '2026-12-12'))).number,
      ).toBe('SJ/2026-27/0001');
    });
  });
});
