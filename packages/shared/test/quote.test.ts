import { describe, expect, it } from 'vitest';
import { paymentParts, quoteReference } from '../src/quote.js';

describe('quote helpers', () => {
  it('names the quote by wedding and version', () => {
    expect(quoteReference('W-102', 2)).toBe('W-102 · Q2');
  });

  it('describes the payment plan in words, with amounts that add up exactly', () => {
    expect(paymentParts(10_45_000_00, [10_000])).toEqual([
      { bps: 10_000, amount: 10_45_000_00, label: 'Full payment to confirm the booking' },
    ]);
    const parts = paymentParts(10_00_001, [5000, 5000]);
    expect(parts.map((p) => p.label)).toEqual([
      '50% advance to confirm the booking',
      '50% balance before the first flight',
    ]);
    expect(parts[0]!.amount + parts[1]!.amount).toBe(10_00_001);
    expect(paymentParts(100_00, [3000, 3000, 4000]).map((p) => p.label)).toEqual([
      '30% advance to confirm the booking',
      '30% instalment 2',
      '40% balance before the first flight',
    ]);
  });
});
