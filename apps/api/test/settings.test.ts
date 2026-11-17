import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SettingsService } from '../src/settings/settings.service.js';
import { createOwner, createTestApp, login, resetLimits, type TestApp } from './app.js';
import { resetDb } from './db.js';

describe('settings', () => {
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

  const get = () => t.http().get('/api/settings').set('authorization', `Bearer ${token}`);
  const patch = (body: object) =>
    t.http().patch('/api/settings').set('authorization', `Bearer ${token}`).send(body);
  type Entry = { key: string; value: unknown; confirmed: boolean };
  const entry = (body: { settings: Entry[] }, key: string) =>
    body.settings.find((s) => s.key === key)!;

  it('needs login', async () => {
    await t.http().get('/api/settings').expect(401);
  });

  it('starts with the defaults from the brief and the GST + cancellation warnings', async () => {
    const res = await get().expect(200);
    expect(entry(res.body, 'markup.default_bps').value).toBe(1000);
    expect(entry(res.body, 'commission.default').value).toEqual({
      basis: 'MARGIN_SHARE',
      bps: 2000,
    });
    expect(entry(res.body, 'target.monthly_margin_paise').value).toBe(20_00_000_00);
    expect(entry(res.body, 'today.chase_operator_hours').value).toBe(2);
    expect(entry(res.body, 'gst.rate_bps')).toMatchObject({ value: 1800, confirmed: false });
    expect(res.body.warnings).toHaveLength(2);
  });

  it('saves several values at once', async () => {
    const res = await patch({
      values: {
        'markup.default_bps': 1250,
        'quote.validity_hours': 48,
        'invoicing.model': 'FEE_ONLY',
      },
    }).expect(200);
    expect(entry(res.body, 'markup.default_bps').value).toBe(1250);
    expect(entry(res.body, 'invoicing.model').value).toBe('FEE_ONLY');
    expect(await t.app.get(SettingsService).get('quote.validity_hours')).toBe(48);
  });

  it('rejects bad values field by field and saves nothing', async () => {
    const res = await patch({
      values: { 'markup.default_bps': 1300, 'gst.rate_bps': 9000, 'gst.sac': '12', nonsense: 1 },
    }).expect(400);
    expect(res.body.fields).toEqual({
      'gst.rate_bps': 'Must be at most 40%',
      'gst.sac': 'A SAC code has 6 digits',
      nonsense: 'Unknown setting',
    });
    expect(await t.app.get(SettingsService).get('markup.default_bps')).toBe(1000);
  });

  describe('GST confirmation (the warning banner)', () => {
    it('needs a SAC code before it can be confirmed', async () => {
      const res = await patch({ values: {}, confirmGst: true }).expect(400);
      expect(res.body.fields['gst.sac']).toBe('Add the SAC code before confirming');
    });

    it('clears the GST warning once confirmed', async () => {
      const res = await patch({ values: { 'gst.sac': '996412' }, confirmGst: true }).expect(200);
      expect(entry(res.body, 'gst.rate_bps').confirmed).toBe(true);
      expect(entry(res.body, 'gst.sac').confirmed).toBe(true);
      expect(res.body.warnings.some((w: string) => w.startsWith('GST'))).toBe(false);
    });

    it('goes back to unconfirmed when GST values change without re-confirming', async () => {
      await patch({ values: { 'gst.sac': '996412' }, confirmGst: true }).expect(200);
      const res = await patch({ values: { 'gst.rate_bps': 500 } }).expect(200);
      expect(entry(res.body, 'gst.rate_bps')).toMatchObject({ value: 500, confirmed: false });
      expect(res.body.warnings.some((w: string) => w.startsWith('GST'))).toBe(true);
    });

    it('does not touch GST confirmation when other settings change', async () => {
      await patch({ values: { 'gst.sac': '996412' }, confirmGst: true }).expect(200);
      const res = await patch({ values: { 'markup.default_bps': 1100 } }).expect(200);
      expect(entry(res.body, 'gst.rate_bps').confirmed).toBe(true);
    });
  });

  it('clears the cancellation-terms warning once terms are written', async () => {
    const res = await patch({
      values: { 'quote.cancellation_terms': '  More than 7 days before departure: 10%.  ' },
    }).expect(200);
    expect(entry(res.body, 'quote.cancellation_terms').value).toBe(
      'More than 7 days before departure: 10%.',
    );
    expect(res.body.warnings.some((w: string) => w.startsWith('Default cancellation'))).toBe(false);
  });

  it('logs every change with before and after values, and who made it', async () => {
    await t.ds.query(`DELETE FROM audit_log`);
    await patch({ values: { 'markup.default_bps': 1200, 'quote.validity_hours': 24 } }).expect(200); // validity unchanged
    const rows: { actor_id: string; entity_id: string; diff: unknown }[] = await t.ds.query(
      `SELECT actor_id, entity_id, diff FROM audit_log WHERE entity = 'setting' ORDER BY id`,
    );
    expect(rows).toEqual([
      {
        actor_id: ownerId,
        entity_id: 'markup.default_bps',
        diff: { value: { from: 1000, to: 1200 } },
      },
    ]);
  });
});
