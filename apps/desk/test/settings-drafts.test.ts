import { settingDef } from '@shubhjets/shared';
import { describe, expect, it } from 'vitest';
import { fromDraft, toDraft } from '../src/composables/settings';

const def = (k: string) => settingDef(k)!;

describe('settings form values', () => {
  it('shows percentages, rupees and hours the way people type them', () => {
    expect(toDraft(def('markup.default_bps'), 1250)).toBe('12.5');
    expect(toDraft(def('target.monthly_margin_paise'), 20_00_000_00)).toBe('20,00,000');
    expect(toDraft(def('today.chase_operator_hours'), 2)).toBe('2');
    expect(toDraft(def('commission.default'), { basis: 'MARGIN_SHARE', bps: 2000 })).toEqual({
      basis: 'MARGIN_SHARE',
      pct: '20',
    });
  });

  it('reads typed values back into paise and basis points', () => {
    expect(fromDraft(def('markup.default_bps'), '12.5')).toBe(1250);
    expect(fromDraft(def('target.monthly_margin_paise'), '25,00,000')).toBe(25_00_000_00);
    expect(fromDraft(def('commission.default'), { basis: 'BOOKING_PERCENT', pct: '2' })).toEqual({
      basis: 'BOOKING_PERCENT',
      bps: 200,
    });
    expect(fromDraft(def('gst.sac'), ' 996412 ')).toBe('996412');
  });

  it('explains unreadable input', () => {
    expect(() => fromDraft(def('today.chase_operator_hours'), '2.5')).toThrow(
      'Enter a whole number of hours',
    );
    expect(() => fromDraft(def('markup.default_bps'), 'ten')).toThrow(/percentage/);
  });
});
