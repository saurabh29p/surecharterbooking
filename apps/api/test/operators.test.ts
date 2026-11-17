import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OperatorsService } from '../src/operators/operators.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';
import { PDF } from './fixtures.js';

const DAY = 86_400_000;

describe('operators', () => {
  let t: TestApp;
  let token: string;
  let svc: OperatorsService;

  beforeAll(async () => {
    t = await createTestApp();
    svc = t.app.get(OperatorsService);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await createOwner(t.ds);
    token = (await login(t)).accessToken;
    svc.now = () => new Date('2026-11-17T06:00:00Z');
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const api = {
    create: (body: object) => authed(t.http().post('/api/operators')).send(body),
    get: (id: string) => authed(t.http().get(`/api/operators/${id}`)),
    list: (q = '') => authed(t.http().get(`/api/operators${q}`)),
    patch: (id: string, body: object) => authed(t.http().patch(`/api/operators/${id}`)).send(body),
    upload: (id: string, kind: string, expiresOn?: string) => {
      const r = authed(t.http().post(`/api/operators/${id}/documents`)).field('kind', kind);
      if (expiresOn) r.field('expiresOn', expiresOn);
      return r.attach('file', PDF, `${kind}.pdf`);
    },
    verifyDoc: (docId: string) => authed(t.http().post(`/api/operator-documents/${docId}/verify`)),
    verify: (id: string) => authed(t.http().post(`/api/operators/${id}/verify`)),
    block: (id: string, reason: string) =>
      authed(t.http().post(`/api/operators/${id}/block`)).send({ reason }),
    unblock: (id: string) => authed(t.http().post(`/api/operators/${id}/unblock`)),
  };

  /** An operator with both documents uploaded and verified, then marked verified. */
  async function verifiedOperator(insuranceExpires = '2027-06-30', nsopExpires = '2027-12-31') {
    const { body } = await api
      .create({
        legalName: 'Operator A Aviation Pvt Ltd',
        brand: 'Operator A',
        nsopNo: 'test-nsop-001',
        bases: ['DEL', 'UDR'],
      })
      .expect(201);
    await api.upload(body.id, 'NSOP', nsopExpires).expect(201);
    const after = await api.upload(body.id, 'INSURANCE', insuranceExpires).expect(201);
    for (const d of after.body.documents) await api.verifyDoc(d.id).expect(204);
    await api.verify(body.id).expect(200);
    return body.id as string;
  }

  it('needs login', async () => {
    await t.http().get('/api/operators').expect(401);
  });

  describe('adding operators', () => {
    it('starts every new operator as FOUND (not verified) and not quotable', async () => {
      const { body } = await api
        .create({ legalName: 'Operator D Aviation Pvt Ltd', nsopNo: 'TEST-NSOP-004' })
        .expect(201);
      const op = (await api.get(body.id).expect(200)).body;
      expect(op).toMatchObject({
        status: 'FOUND',
        quotable: { ok: false, reason: 'Not verified yet' },
        readyToVerify: false,
      });
      await expect(svc.assertQuotable(body.id)).rejects.toThrow(
        "Operator D Aviation Pvt Ltd can't be quoted: Not verified yet",
      );
    });

    it('validates fields in plain words', async () => {
      const res = await api
        .create({
          legalName: 'X',
          cin: '123',
          gstin: '07ABC',
          website: 'not a url at all',
          bases: ['ZZZ'],
        })
        .expect(400);
      expect(Object.keys(res.body.fields).sort()).toEqual(['cin', 'gstin', 'legalName', 'website']);
      const bad = await api.create({ legalName: 'Operator Z', bases: ['ZZZ'] }).expect(400);
      expect(bad.body.fields.bases).toBe('Unknown airport code: ZZZ');
    });

    it('refuses a duplicate NSOP number', async () => {
      await api.create({ legalName: 'Operator A', nsopNo: 'TEST-1' }).expect(201);
      const res = await api.create({ legalName: 'Operator B', nsopNo: 'test-1' }).expect(400);
      expect(res.body.fields.nsopNo).toMatch(/already has this NSOP/);
    });

    it('adds https:// to bare web addresses', async () => {
      const { body } = await api
        .create({ legalName: 'Operator A', website: 'operator-a.example.test' })
        .expect(201);
      expect((await api.get(body.id)).body.website).toBe('https://operator-a.example.test');
    });
  });

  describe('verification (hard rule 1)', () => {
    it('cannot be verified until NSOP and insurance are uploaded, dated and checked by you', async () => {
      const { body } = await api.create({ legalName: 'Operator A', nsopNo: 'TEST-1' }).expect(201);
      const early = await api.verify(body.id).expect(409);
      expect(early.body.missing).toEqual(
        expect.arrayContaining([
          'NSOP permit checked and verified by you',
          'Insurance certificate checked and verified by you',
        ]),
      );
      const missingDate = await authed(t.http().post(`/api/operators/${body.id}/documents`))
        .field('kind', 'INSURANCE')
        .attach('file', PDF, 'ins.pdf')
        .expect(400);
      expect(missingDate.body.fields.expiresOn).toBe('Enter the expiry date shown on the document');
      await api.upload(body.id, 'NSOP', '2027-12-31').expect(201);
      const withDocs = (await api.upload(body.id, 'INSURANCE', '2027-06-30').expect(201)).body;
      // Uploaded is not enough: you must check each one.
      await api.verify(body.id).expect(409);
      for (const d of withDocs.documents) await api.verifyDoc(d.id).expect(204);
      const done = (await api.verify(body.id).expect(200)).body;
      expect(done).toMatchObject({ status: 'VERIFIED', quotable: { ok: true } });
      await expect(svc.assertQuotable(body.id)).resolves.toBeUndefined();
    });

    it('records "verified by me on" for each document', async () => {
      const id = await verifiedOperator();
      const op = (await api.get(id)).body;
      expect(op.documents.every((d: { verifiedOn: string }) => d.verifiedOn === '2026-11-17')).toBe(
        true,
      );
    });

    it('marks EXPIRING_SOON within 30 days but stays quotable', async () => {
      const id = await verifiedOperator('2026-11-26');
      const op = (await api.get(id)).body;
      expect(op).toMatchObject({
        status: 'EXPIRING_SOON',
        statusReason: 'Insurance certificate expires in 9 days',
        quotable: { ok: true },
      });
    });

    it('refuses an operator whose document expired even before the daily job runs', async () => {
      const id = await verifiedOperator('2026-11-20');
      svc.now = () => new Date(Date.parse('2026-11-17T06:00:00Z') + 4 * DAY);
      await expect(svc.assertQuotable(id)).rejects.toThrow(
        /Insurance certificate expired on 20 Nov 2026/,
      );
    });

    it('re-checks a document whose expiry date is changed', async () => {
      const id = await verifiedOperator();
      const doc = (await api.get(id)).body.documents.find(
        (d: { kind: string }) => d.kind === 'INSURANCE',
      );
      await authed(t.http().patch(`/api/operator-documents/${doc.id}`))
        .send({ expiresOn: '2028-01-01' })
        .expect(204);
      const op = (await api.get(id)).body;
      expect(op.status).toBe('FOUND');
      expect(op.quotable.ok).toBe(false);
    });

    it('drops back to not-quotable when a verified document is deleted', async () => {
      const id = await verifiedOperator();
      const doc = (await api.get(id)).body.documents.find(
        (d: { kind: string }) => d.kind === 'NSOP',
      );
      await authed(t.http().delete(`/api/operator-documents/${doc.id}`)).expect(204);
      expect((await api.get(id)).body.quotable.ok).toBe(false);
    });

    it('blocks and unblocks by hand, with a reason', async () => {
      const id = await verifiedOperator();
      const blocked = (await api.block(id, 'Late twice this season').expect(200)).body;
      expect(blocked).toMatchObject({
        status: 'BLOCKED',
        blockKind: 'MANUAL',
        blockedReason: 'Late twice this season',
        quotable: { ok: false },
      });
      await api.verify(id).expect(409);
      const back = (await api.unblock(id).expect(200)).body;
      expect(back).toMatchObject({ status: 'VERIFIED', blockKind: null, quotable: { ok: true } });
    });
  });

  describe('aircraft and contacts', () => {
    it('adds aircraft with validation and refuses duplicate registrations', async () => {
      const id = await verifiedOperator();
      await authed(t.http().post(`/api/operators/${id}/aircraft`))
        .send({
          type: 'Citation XLS',
          registration: 'vt-zz1',
          category: 'MIDSIZE',
          seats: 8,
          year: 2012,
          baseAirport: 'del',
        })
        .expect(201);
      const dup = await authed(t.http().post(`/api/operators/${id}/aircraft`))
        .send({ type: 'Hawker', registration: 'VT-ZZ1', category: 'MIDSIZE', seats: 8 })
        .expect(400);
      expect(dup.body.fields.registration).toMatch(/already exists/);
      const bad = await authed(t.http().post(`/api/operators/${id}/aircraft`))
        .send({ type: 'X', category: 'BLIMP', seats: 0 })
        .expect(400);
      expect(Object.keys(bad.body.fields).sort()).toEqual(['category', 'seats', 'type']);
      const op = (await api.get(id)).body;
      expect(op.aircraft[0]).toMatchObject({ registration: 'VT-ZZ1', baseAirport: 'DEL' });
    });

    it('keeps one primary contact and normalises phones', async () => {
      const { body } = await api.create({ legalName: 'Operator A' }).expect(201);
      const c1 = (
        await authed(t.http().post(`/api/operators/${body.id}/contacts`))
          .send({ name: 'Ops desk', phone: '98765 43210' })
          .expect(201)
      ).body;
      expect(c1).toMatchObject({ phone: '+919876543210', isPrimary: true });
      await authed(t.http().post(`/api/operators/${body.id}/contacts`))
        .send({ name: 'Sales', isPrimary: true })
        .expect(201);
      const contacts = (await api.get(body.id)).body.contacts;
      expect(
        contacts.map((c: { name: string; isPrimary: boolean }) => [c.name, c.isPrimary]),
      ).toEqual([
        ['Sales', true],
        ['Ops desk', false],
      ]);
      const bad = await authed(t.http().post(`/api/operators/${body.id}/contacts`))
        .send({ name: 'X', phone: '123' })
        .expect(400);
      expect(bad.body.fields.phone).toMatch(/10-digit/);
    });
  });

  describe('list', () => {
    it('filters by status, base airport, category and seats, and shows the nearest expiry', async () => {
      const a = await verifiedOperator('2026-11-26');
      await authed(t.http().post(`/api/operators/${a}/aircraft`))
        .send({ type: 'Legacy 600', category: 'HEAVY', seats: 13 })
        .expect(201);
      await api.create({ legalName: 'Operator D', bases: ['BOM'] }).expect(201);
      const all = (await api.list().expect(200)).body;
      expect(all.map((o: { legalName: string }) => o.legalName)).toEqual([
        'Operator A Aviation Pvt Ltd',
        'Operator D',
      ]);
      expect(all[0]).toMatchObject({
        status: 'EXPIRING_SOON',
        bases: ['DEL', 'UDR'],
        fleet: { HEAVY: 1 },
        maxSeats: 13,
        nearestExpiry: { kind: 'INSURANCE', daysLeft: 9 },
      });
      expect((await api.list('?status=VERIFIED,EXPIRING_SOON')).body).toHaveLength(1);
      expect(
        (await api.list('?base=BOM')).body.map((o: { legalName: string }) => o.legalName),
      ).toEqual(['Operator D']);
      expect((await api.list('?category=HEAVY&minSeats=12')).body).toHaveLength(1);
      expect((await api.list('?minSeats=14')).body).toHaveLength(0);
      expect((await api.list('?q=operator%20d')).body).toHaveLength(1);
    });
  });

  describe('bank details and audit', () => {
    it('encrypts bank details, masks them, and audits every view and status change', async () => {
      const { body } = await api
        .create({
          legalName: 'Operator A',
          bankDetails: {
            accountName: 'Operator A',
            accountNumber: '999900001111',
            ifsc: 'HDFC0001234',
            bankName: 'Example Bank',
          },
        })
        .expect(201);
      const op = (await api.get(body.id)).body;
      expect(op).toMatchObject({ hasBankDetails: true, bankHint: 'Example Bank ••••1111' });
      expect(JSON.stringify(op)).not.toContain('999900001111');
      const reveal = (
        await authed(t.http().get(`/api/operators/${body.id}/bank-details`)).expect(200)
      ).body;
      expect(reveal.bankDetails.accountNumber).toBe('999900001111');
      await api.block(body.id, 'Testing the log').expect(200);
      const audit: { action: string; diff: Record<string, unknown> | null }[] = await t.ds.query(
        `SELECT action, diff FROM audit_log WHERE entity = 'operator' AND entity_id = $1 ORDER BY id`,
        [body.id],
      );
      expect(audit.map((a) => a.action)).toEqual(['CREATED', 'BANK_DETAILS_VIEWED', 'UPDATED']);
      expect(audit[2]!.diff).toMatchObject({ status: { from: 'FOUND', to: 'BLOCKED' } });
      expect(JSON.stringify(audit)).not.toContain('999900001111');
    });
  });
});
