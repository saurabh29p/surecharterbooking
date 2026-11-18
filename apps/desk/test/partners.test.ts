import { describe, expect, it } from 'vitest';
import { newPartnerForm, partnerBody } from '../src/composables/partnerForm';
import { commissionText, waLink } from '../src/composables/partners';

describe('partner helpers', () => {
  it('describes commission terms plainly', () => {
    expect(commissionText('MARGIN_SHARE', 2000)).toBe('20% of margin');
    expect(commissionText('BOOKING_PERCENT', 250)).toBe('2.5% of booking value');
  });

  it('starts new partners with the default commission from Settings', () => {
    const f = newPartnerForm(null, { basis: 'BOOKING_PERCENT', bps: 200 });
    expect(f).toMatchObject({
      type: 'PLANNER',
      commissionBasis: 'BOOKING_PERCENT',
      commissionPct: '2',
    });
  });

  it('turns the form into an API body and explains an unreadable percentage', () => {
    const f = newPartnerForm();
    f.firm = '  Planner P9 ';
    f.commissionPct = '12.5';
    expect(partnerBody(f)).toMatchObject({
      firm: 'Planner P9',
      commissionBps: 1250,
      commissionBasis: 'MARGIN_SHARE',
    });
    f.commissionPct = 'twenty';
    expect(() => partnerBody(f)).toThrow();
    try {
      partnerBody(f);
    } catch (e) {
      expect((e as { fields: Record<string, string> }).fields.commissionBps).toMatch(/percentage/);
    }
  });

  it('builds WhatsApp links from stored phones', () => {
    expect(waLink('+919876543210')).toBe('https://wa.me/919876543210');
  });
});
