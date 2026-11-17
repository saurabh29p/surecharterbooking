import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  checkPayoutCovered,
  computeCommission,
  computeGst,
  computeQuoteTotals,
  paymentSchedule,
  priceLine,
  requiredPayment,
  type GstInput,
} from '../src/index.js';

const L = 1_00_000_00; // ₹1 lakh in paise
const delhiGst: GstInput = {
  rateBps: 1800,
  model: 'FULL_VALUE',
  supplierState: 'DL',
  placeOfSupplyState: 'DL',
};

describe('priceLine', () => {
  it('applies a percentage markup', () => {
    expect(priceLine({ cost: 10 * L, markupType: 'PERCENT', markupBps: 1000 })).toEqual({
      cost: 10 * L,
      sell: 11 * L,
      margin: 1 * L,
    });
  });

  it('applies a fixed markup', () => {
    expect(priceLine({ cost: 10 * L, markupType: 'FIXED', markupAmount: 50_000_00 }).sell).toBe(
      10.5 * L,
    );
  });

  it('takes an explicit sell for extras', () => {
    expect(priceLine({ cost: 20_000_00, sell: 30_000_00 }).margin).toBe(10_000_00);
  });

  it('allows a loss-making line but not negative cost or sell', () => {
    expect(priceLine({ cost: 100, sell: 50 }).margin).toBe(-50);
    expect(() => priceLine({ cost: -1, sell: 0 })).toThrow(MoneyError);
    expect(() => priceLine({ cost: 100, markupType: 'FIXED', markupAmount: -200 })).toThrow(
      MoneyError,
    );
  });
});

describe('computeGst', () => {
  it('splits intra-state GST into CGST + SGST on full value', () => {
    const gst = computeGst(11 * L, 1 * L, delhiGst);
    expect(gst).toMatchObject({
      taxable: 11 * L,
      intraState: true,
      cgst: 99_000_00,
      sgst: 99_000_00,
      igst: 0,
      total: 1_98_000_00,
    });
  });

  it('charges IGST for another state', () => {
    const gst = computeGst(11 * L, 1 * L, { ...delhiGst, placeOfSupplyState: 'RJ' });
    expect(gst).toMatchObject({
      intraState: false,
      cgst: 0,
      sgst: 0,
      igst: 1_98_000_00,
      total: 1_98_000_00,
    });
  });

  it('is case-insensitive on state codes', () => {
    expect(computeGst(L, 0, { ...delhiGst, placeOfSupplyState: ' dl ' }).intraState).toBe(true);
  });

  it('assumes intra-state when place of supply is unknown, and says so', () => {
    const gst = computeGst(L, 0, { ...delhiGst, placeOfSupplyState: null });
    expect(gst.intraState).toBe(true);
    expect(gst.placeOfSupplyAssumed).toBe(true);
  });

  it('taxes only the fee in the fee-only model', () => {
    const gst = computeGst(11 * L, 1 * L, { ...delhiGst, model: 'FEE_ONLY' });
    expect(gst.taxable).toBe(1 * L);
    expect(gst.total).toBe(18_000_00);
  });

  it('never taxes a negative fee', () => {
    expect(computeGst(L, -500, { ...delhiGst, model: 'FEE_ONLY' }).total).toBe(0);
  });

  it('keeps CGST and SGST equal with odd paise', () => {
    const gst = computeGst(101, 0, delhiGst); // 18% of 101 paise = 18.18
    expect(gst.cgst).toBe(gst.sgst);
    expect(gst.total).toBe(gst.cgst * 2);
  });

  it('uses whatever rate is configured (nothing hard-coded)', () => {
    expect(computeGst(L, 0, { ...delhiGst, rateBps: 500, placeOfSupplyState: 'MH' }).igst).toBe(
      5_000_00,
    );
  });
});

describe('computeCommission', () => {
  it('defaults: 20% share of margin', () => {
    expect(computeCommission(1 * L, 11 * L, { basis: 'MARGIN_SHARE', bps: 2000 })).toBe(20_000_00);
  });

  it('can be a % of booking value', () => {
    expect(computeCommission(1 * L, 11 * L, { basis: 'BOOKING_PERCENT', bps: 200 })).toBe(
      22_000_00,
    );
  });

  it('is never negative', () => {
    expect(computeCommission(-L, 11 * L, { basis: 'MARGIN_SHARE', bps: 2000 })).toBe(0);
  });
});

describe('computeQuoteTotals', () => {
  it('prices a multi-leg wedding end to end', () => {
    const totals = computeQuoteTotals({
      lines: [
        { cost: 8 * L, markupType: 'PERCENT', markupBps: 1000 }, // DEL→UDR
        { cost: 8 * L, markupType: 'PERCENT', markupBps: 1000 }, // UDR→DEL
        { cost: 6 * L, markupType: 'FIXED', markupAmount: 50_000_00 }, // BOM→UDR
        { cost: 20_000_00, sell: 30_000_00 }, // extra: catering
      ],
      gst: { ...delhiGst, placeOfSupplyState: 'RJ' },
      commission: { basis: 'MARGIN_SHARE', bps: 2000 },
    });
    expect(totals.cost).toBe(22.2 * L);
    expect(totals.sellSubtotal).toBe(24.4 * L);
    expect(totals.margin).toBe(2.2 * L);
    expect(totals.marginBps).toBe(902); // 9.02%
    expect(totals.gst.igst).toBe(4_39_200_00);
    expect(totals.total).toBe(24.4 * L + 4_39_200_00);
    expect(totals.commission).toBe(44_000_00);
    expect(totals.netMargin).toBe(1_76_000_00);
  });

  it('has no commission without a partner', () => {
    const totals = computeQuoteTotals({
      lines: [{ cost: L, markupType: 'PERCENT', markupBps: 1000 }],
      gst: delhiGst,
      commission: null,
    });
    expect(totals.commission).toBe(0);
    expect(totals.netMargin).toBe(totals.margin);
  });

  it('handles an empty quote', () => {
    const totals = computeQuoteTotals({ lines: [], gst: delhiGst, commission: null });
    expect(totals).toMatchObject({ cost: 0, sellSubtotal: 0, margin: 0, marginBps: 0, total: 0 });
  });
});

describe('payments', () => {
  it('requires 100% by default, or a configured share', () => {
    expect(requiredPayment(12 * L, 10_000)).toBe(12 * L);
    expect(requiredPayment(12 * L, 5000)).toBe(6 * L);
    expect(() => requiredPayment(L, 10_001)).toThrow(MoneyError);
  });

  it('splits advance + balance exactly', () => {
    expect(paymentSchedule(1001, [5000, 5000])).toEqual([501, 500]);
    expect(paymentSchedule(12 * L, [3000, 7000])).toEqual([3.6 * L, 8.4 * L]);
    expect(() => paymentSchedule(L, [5000, 4000])).toThrow(MoneyError);
  });

  it('blocks payouts not covered by client money (hard rule 3)', () => {
    expect(checkPayoutCovered(10 * L, 0, 8 * L)).toEqual({ allowed: true, shortfall: 0 });
    expect(checkPayoutCovered(10 * L, 8 * L, 2 * L)).toEqual({ allowed: true, shortfall: 0 });
    expect(checkPayoutCovered(10 * L, 8 * L, 3 * L)).toEqual({ allowed: false, shortfall: 1 * L });
    expect(checkPayoutCovered(0, 0, 1)).toEqual({ allowed: false, shortfall: 1 });
  });
});
