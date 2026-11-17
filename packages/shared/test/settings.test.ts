import { describe, expect, it } from 'vitest';
import { SETTING_DEFS, settingDef, settingsWarnings, validateSetting } from '../src/index.js';

const def = (k: string) => settingDef(k)!;

describe('setting definitions', () => {
  it('cover every setting the database ships with', () => {
    const keys = SETTING_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        'markup.default_bps',
        'gst.rate_bps',
        'gst.sac',
        'invoicing.model',
        'today.chase_operator_hours',
        'ai.monthly_cap_paise',
      ]),
    );
  });

  it('validate percentages (basis points) with readable limits', () => {
    expect(validateSetting(def('markup.default_bps'), 1250)).toBeNull();
    expect(validateSetting(def('markup.default_bps'), 12.5)).toMatch(/percentage/);
    expect(validateSetting(def('gst.rate_bps'), 5000)).toBe('Must be at most 40%');
  });

  it('validate money in paise', () => {
    expect(validateSetting(def('target.monthly_margin_paise'), 20_00_000_00)).toBeNull();
    expect(validateSetting(def('ai.monthly_cap_paise'), -1)).toMatch(/rupees/);
    expect(validateSetting(def('ai.monthly_cap_paise'), 2_00_000_00)).toBe(
      'Must be at most ₹1,00,000',
    );
  });

  it('validate whole numbers with units', () => {
    expect(validateSetting(def('today.chase_operator_hours'), 2)).toBeNull();
    expect(validateSetting(def('today.chase_operator_hours'), 0)).toBe('Must be at least 1 hours');
    expect(validateSetting(def('share.link_expiry_days'), 1.5)).toMatch(/whole number of days/);
  });

  it('validate text, SAC code, options and commission', () => {
    expect(validateSetting(def('gst.sac'), '')).toBeNull();
    expect(validateSetting(def('gst.sac'), '996412')).toBeNull();
    expect(validateSetting(def('gst.sac'), '99641')).toBe('A SAC code has 6 digits');
    expect(validateSetting(def('invoicing.model'), 'FEE_ONLY')).toBeNull();
    expect(validateSetting(def('invoicing.model'), 'HALF')).toMatch(/options/);
    expect(
      validateSetting(def('commission.default'), { basis: 'MARGIN_SHARE', bps: 2000 }),
    ).toBeNull();
    expect(validateSetting(def('commission.default'), { basis: 'X', bps: 2000 })).toMatch(/basis/);
    expect(
      validateSetting(def('commission.default'), { basis: 'MARGIN_SHARE', bps: 20_000 }),
    ).toMatch(/0 and 100/);
  });
});

describe('settingsWarnings', () => {
  it('warns until GST is confirmed and cancellation terms exist', () => {
    const entries = [
      { key: 'gst.rate_bps', value: 1800, confirmed: false },
      { key: 'gst.sac', value: '', confirmed: false },
      { key: 'quote.cancellation_terms', value: ' ', confirmed: false },
    ];
    expect(settingsWarnings(entries)).toHaveLength(2);
    const fixed = [
      { key: 'gst.rate_bps', value: 1800, confirmed: true },
      { key: 'gst.sac', value: '996412', confirmed: true },
      { key: 'quote.cancellation_terms', value: 'More than 7 days: 10%…', confirmed: true },
    ];
    expect(settingsWarnings(fixed)).toEqual([]);
  });
});
