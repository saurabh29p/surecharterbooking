import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { templateCsv } from '@shubhjets/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { safeCell } from '../src/imports/exports.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

const TEMPLATES = join(import.meta.dirname, '../../../docs/templates');

describe('CSV import and export', () => {
  let t: TestApp;
  let token: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.ds);
    resetLimits(t);
    await createOwner(t.ds);
    token = (await login(t)).accessToken;
  });

  const authed = <T extends { set: (k: string, v: string) => T }>(r: T) =>
    r.set('authorization', `Bearer ${token}`);
  const preview = (kind: string, csv: string, mapping?: object) =>
    authed(t.http().post(`/api/imports/${kind}/preview`)).send({ csv, mapping });
  const commit = (kind: string, csv: string, decisions: object = {}, mapping?: object) =>
    authed(t.http().post(`/api/imports/${kind}/commit`)).send({ csv, decisions, mapping });

  it('needs login', async () => {
    await t.http().post('/api/imports/partners/preview').send({ csv: 'a' }).expect(401);
  });

  describe('templates', () => {
    it('in docs/templates match what the app generates (headers + one fake row)', () => {
      for (const kind of ['partners', 'operators'] as const) {
        expect(readFileSync(join(TEMPLATES, `${kind}-template.csv`), 'utf8')).toBe(
          `\uFEFF${templateCsv(kind)}`,
        );
      }
    });

    it('download with the right headers', async () => {
      const res = await authed(t.http().get('/api/imports/templates/partners.csv')).expect(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="partners-template.csv"',
      );
      expect(res.text.split('\r\n')[0]).toBe(
        '\uFEFFtype,firm,city,contact_person,phone,email,website,instagram,source_link,fit_note',
      );
      await authed(t.http().get('/api/imports/templates/weddings.csv')).expect(400);
    });

    it('import cleanly as they are', async () => {
      const p = (await preview('partners', templateCsv('partners')).expect(200)).body;
      expect(p.summary).toEqual({ total: 1, ready: 1, withProblems: 0, duplicates: 0 });
      const o = (await preview('operators', templateCsv('operators')).expect(200)).body;
      expect(o.rows[0]).toMatchObject({ problems: [], suggested: 'add' });
      await commit('operators', templateCsv('operators')).expect(200);
      const ops = (await authed(t.http().get('/api/operators')).expect(200)).body;
      expect(ops).toEqual([
        expect.objectContaining({
          legalName: 'Operator Z Aviation Pvt Ltd',
          status: 'FOUND',
          bases: ['DEL', 'UDR'],
          fleet: { MIDSIZE: 1, TURBOPROP: 1 },
        }),
      ]);
      const detail = (await authed(t.http().get(`/api/operators/${ops[0].id}`))).body;
      expect(detail.contacts).toEqual([
        expect.objectContaining({ name: 'Ops Desk Z', phone: '+919000000199', isPrimary: true }),
      ]);
      expect(detail.quotable.ok).toBe(false); // imported operators are never verified
    });
  });

  describe('preview', () => {
    it('matches loosely named columns and lets you override the match', async () => {
      const csv = 'Firm Name,Mobile,Kind,Town\nPlanner P5,98765 43210,planner,Udaipur\n';
      const res = (await preview('partners', csv).expect(200)).body;
      expect(res.mapping).toMatchObject({ firm: 0, phone: 1, type: 2, city: 3, email: null });
      expect(res.rows[0].values).toMatchObject({
        firm: 'Planner P5',
        phone: '98765 43210',
        type: 'planner',
        city: 'Udaipur',
      });
      const overridden = (await preview('partners', csv, { city: null }).expect(200)).body;
      expect(overridden.rows[0].values.city).toBe('');
      await preview('partners', csv, { city: 9 }).expect(400);
    });

    it('says what is wrong with each line, in plain words', async () => {
      const csv = [
        'type,firm,phone,email',
        'dj,Planner P6,123,not-an-email',
        ',X,,',
        'hotel,Hotel H6,9876543211,h6@example.test',
      ].join('\n');
      const res = (await preview('partners', csv).expect(200)).body;
      expect(res.rows[0]).toMatchObject({ row: 2, suggested: 'skip' });
      expect(res.rows[0].problems).toEqual([
        'Type: "dj" is not planner, hotel or other',
        'Phone: Enter a 10-digit mobile number, or + and the country code',
        'Email: Enter a valid email',
      ]);
      expect(res.rows[1].problems).toEqual([
        'Type: required (planner, hotel or other)',
        'Firm: Enter the firm or hotel name',
      ]);
      expect(res.rows[2]).toMatchObject({ row: 4, problems: [], suggested: 'add' });
      expect(res.summary).toEqual({ total: 3, ready: 1, withProblems: 2, duplicates: 0 });
    });

    it('explains operator cell formats', async () => {
      const csv =
        'legal_name,bases,aircraft,contacts\nOperator Y,DEL;ZZZ,Citation|VT-ZZ8|blimp|8;Hawker|VT-ZZ7|midsize|0,Ops|123|\n';
      const row = (await preview('operators', csv).expect(200)).body.rows[0];
      expect(row.problems).toEqual([
        'Bases: unknown airport code ZZZ',
        'Aircraft 1: category "blimp" should be turboprop, light, midsize, super-midsize or heavy',
        'Aircraft 2: At least 1 seat',
        'Contact 1: Enter a 10-digit mobile number, or + and the country code',
      ]);
    });

    it('finds duplicates in the database and earlier in the same file', async () => {
      await authed(t.http().post('/api/partners'))
        .send({ type: 'PLANNER', firm: 'Planner P1', phone: '9876543210' })
        .expect(201);
      const csv = [
        'type,firm,phone,website',
        'planner,P1 Weddings,+91 98765 43210,',
        'planner,Planner P7,9876543212,https://p7.example.test',
        'planner,Planner P7 again,,www.p7.example.test/about',
      ].join('\n');
      const res = (await preview('partners', csv).expect(200)).body;
      expect(res.rows[0]).toMatchObject({
        suggested: 'merge',
        duplicates: [{ name: 'Planner P1', matchedOn: ['phone'] }],
      });
      expect(res.rows[1]).toMatchObject({ suggested: 'add', sameAsRow: null });
      expect(res.rows[2]).toMatchObject({ suggested: 'skip', sameAsRow: 3 });
      expect(res.summary.duplicates).toBe(2);
    });

    it('refuses empty, header-only, oversized and malformed files', async () => {
      expect((await preview('partners', '\n\n').expect(400)).body.message).toBe(
        'The file is empty',
      );
      expect((await preview('partners', 'type,firm\n').expect(400)).body.message).toMatch(
        /no data rows/,
      );
      const many = 'type,firm\n' + 'planner,P\n'.repeat(2001);
      expect((await preview('partners', many).expect(400)).body.message).toMatch(
        /At most 2000 rows/,
      );
      expect(
        (await preview('partners', 'type,firm\n"planner,P\n').expect(400)).body.message,
      ).toMatch(/valid CSV/);
    });
  });

  describe('commit', () => {
    it('adds new lines, merges into duplicates (filling only empty fields) and skips what you choose', async () => {
      const { body: existing } = await authed(t.http().post('/api/partners'))
        .send({ type: 'PLANNER', firm: 'Planner P1', phone: '9876543210', city: 'New Delhi' })
        .expect(201);
      const csv = [
        'type,firm,city,phone,email',
        'planner,P1 Weddings,Jaipur,9876543210,p1@example.test', // merge: email filled, city kept
        'hotel,Hotel H7,Udaipur,9876543213,', // add
        'planner,Planner P8,,9876543214,', // skipped by choice
      ].join('\n');
      const res = (await commit('partners', csv, { '4': 'skip' }).expect(200)).body;
      expect(res).toMatchObject({ added: 1, merged: 1, skipped: 1 });
      const p1 = (await authed(t.http().get(`/api/partners/${existing.id}`))).body;
      expect(p1).toMatchObject({ firm: 'Planner P1', city: 'New Delhi', email: 'p1@example.test' });
      const h7 = (await authed(t.http().get(`/api/partners/${res.addedIds[0]}`))).body;
      expect(h7).toMatchObject({ firm: 'Hotel H7', type: 'HOTEL', status: 'IMPORTED' });
      expect(h7.consents).toEqual([
        expect.objectContaining({ source: 'RESEARCH_IMPORT', withdrawnAt: null }),
      ]);
    });

    it('lets you add a duplicate as a separate record if you choose', async () => {
      await authed(t.http().post('/api/partners'))
        .send({ type: 'PLANNER', firm: 'Planner P1', phone: '9876543210' })
        .expect(201);
      const res = (
        await commit('partners', 'type,firm,phone\nplanner,P1 Branch,9876543210\n', {
          '2': 'add',
        }).expect(200)
      ).body;
      expect(res.added).toBe(1);
    });

    it('is all or nothing: a bad line you did not skip stops the whole import', async () => {
      const csv = 'type,firm,phone\nplanner,Planner P10,9876543215\ndj,Bad,123\n';
      const res = await commit('partners', csv, { '3': 'add' }).expect(400);
      expect(res.body.message).toMatch(/^Line 3 has problems \(Type: "dj"/);
      const [n] = await t.ds.query(`SELECT count(*)::int AS n FROM partner`);
      expect(n.n).toBe(0);
    });

    it('merges an operator by NSOP number, adding only new bases, aircraft and contacts', async () => {
      await commit('operators', templateCsv('operators')).expect(200);
      const update = [
        'legal_name,nsop_no,bases,aircraft,contacts',
        'Operator Z Aviation,test-nsop-099,DEL;JAI,Citation XLS|VT-ZZ9|midsize|8;Legacy 600|VT-ZZ5|heavy|13,Ops Desk Z|+91 90000 00199|;Sales Z|9876543216|',
      ].join('\n');
      const pv = (await preview('operators', update).expect(200)).body;
      expect(pv.rows[0]).toMatchObject({
        suggested: 'merge',
        duplicates: [{ matchedOn: ['NSOP number'] }],
      });
      expect((await commit('operators', update).expect(200)).body).toMatchObject({
        merged: 1,
        added: 0,
      });
      const [op] = (await authed(t.http().get('/api/operators'))).body;
      expect(op).toMatchObject({
        legalName: 'Operator Z Aviation Pvt Ltd',
        bases: ['DEL', 'JAI', 'UDR'],
        fleet: { MIDSIZE: 1, TURBOPROP: 1, HEAVY: 1 },
      });
      const detail = (await authed(t.http().get(`/api/operators/${op.id}`))).body;
      expect(detail.contacts.map((c: { name: string }) => c.name).sort()).toEqual([
        'Ops Desk Z',
        'Sales Z',
      ]);
    });

    it('records the import in the activity log', async () => {
      await commit('partners', templateCsv('partners')).expect(200);
      const [row] = await t.ds.query(`SELECT action, diff FROM audit_log WHERE entity = 'import'`);
      expect(row).toEqual({
        action: 'IMPORTED',
        diff: { kind: 'partners', rows: 1, added: 1, merged: 0, skipped: 0 },
      });
    });
  });

  describe('exports', () => {
    it('escapes cells a spreadsheet would run as formulas', () => {
      expect(
        ['=HYPERLINK("x")', '+91', '-5', '@SUM(A1)', 'Planner P1', '', null].map(safeCell),
      ).toEqual([`'=HYPERLINK("x")`, `'+91`, `'-5`, `'@SUM(A1)`, 'Planner P1', '', '']);
    });

    it('exports partners with their figures, Excel-friendly', async () => {
      await authed(t.http().post('/api/partners'))
        .send({ type: 'PLANNER', firm: '=cmd|calc', phone: '9876543210' })
        .expect(201);
      const res = await authed(t.http().get('/api/exports/partners.csv')).expect(200);
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="shubhjets-partners-\d{4}-\d{2}-\d{2}\.csv"/,
      );
      const lines = res.text.split('\r\n');
      expect(lines[0]!.startsWith('\uFEFFtype,firm,city')).toBe(true);
      expect(lines[1]).toContain(`'=cmd|calc`);
      expect(lines[1]).toContain(`'+919876543210`);
    });

    it('exports weddings with money in rupees', async () => {
      const { seed } = await import('../src/db/seed-data.js');
      const { EncryptionService } = await import('../src/crypto/encryption.service.js');
      await seed(t.ds, t.app.get(EncryptionService));
      resetLimits(t);
      token = (
        await t
          .http()
          .post('/api/auth/login')
          .send({ email: 'owner@shubhjets.test', password: 'shubhjets dev passphrase' })
      ).body.accessToken;
      const res = await authed(t.http().get('/api/exports/weddings.csv')).expect(200);
      const lines = res.text.trim().split('\r\n');
      expect(lines).toHaveLength(7);
      const header = lines[0]!.replace('\uFEFF', '').split(',');
      const w104 = lines.find((l) => l.startsWith('W-104'))!.split(',');
      const col = (name: string) => w104[header.indexOf(name)];
      expect(col('status')).toBe('SIGNED_AND_PAID');
      expect(col('sell_ex_gst_inr')).toBe('1015000.00');
      expect(col('margin_inr')).toBe('100000.00');
      expect(col('commission_inr')).toBe('20000.00');
    });
  });
});
