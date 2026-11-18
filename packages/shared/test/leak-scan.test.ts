import { describe, expect, it } from 'vitest';
import { describeLeaks, findLeaks, numberTokens } from '../src/leak-scan.js';

const L = 1_00_000_00; // ₹1 lakh in paise

describe('numberTokens', () => {
  it('reads Indian, plain, lakh, crore and percent forms', () => {
    const t = numberTokens('₹4,75,000 · 475000 · 4.75 lakh · ₹4.75L · ₹1.2Cr · 9.09% · 12 Dec');
    expect(t.map((x) => [x.paise, x.percent])).toEqual([
      [4.75 * L, false],
      [4.75 * L, false],
      [4.75 * L, false],
      [4.75 * L, false],
      [120 * L, false],
      [909, true],
      [1200, false],
    ]);
  });

  it('copes with text extraction splitting a number after a comma', () => {
    expect(numberTokens('₹4,75, 000')[0]!.paise).toBe(4.75 * L);
  });
});

describe('findLeaks', () => {
  const amounts = [
    { label: 'Operator A net rate', paise: 4.75 * L },
    { label: 'Our margin', paise: 47_500_00 },
  ];

  it('passes a clean client document', () => {
    const text = 'Leg 1 New Delhi → Jaipur ₹5,22,500 GST @ 18% ₹94,050 Total ₹6,16,550';
    expect(findLeaks(text, { amounts, allowedPercents: [1800] })).toEqual([]);
  });

  it('catches a net rate written in any common way', () => {
    for (const leak of ['₹4,75,000', 'Rs. 475000', '4.75 lakh', '₹4.75L', '475,000']) {
      const found = findLeaks(`Leg 1 ${leak}`, { amounts });
      expect(found, leak).toHaveLength(1);
      expect(found[0]!.label).toBe('Operator A net rate');
    }
  });

  it('catches the internal words and margin percentages', () => {
    const found = findLeaks('Our margin 9.09% on the net rate', {
      amounts: [],
      percents: [{ label: 'Margin %', bps: 909 }],
    });
    expect(found.map((f) => f.label)).toEqual([
      'the words "net rate"',
      'the word "margin"',
      'Margin %',
    ]);
    expect(describeLeaks(found)).toContain('Margin % ("9.09%")');
  });

  it('can skip the word check for documents that must name the commission basis', () => {
    expect(findLeaks('Commission: 20% of the Margin', { amounts: [], checkWords: false })).toEqual(
      [],
    );
  });

  it('catches operator bank details even with spaces or dashes', () => {
    const texts = [
      { label: 'Operator A bank account', value: '000111222333' },
      { label: 'Operator A IFSC', value: 'TEST0000001' },
    ];
    expect(
      findLeaks('Pay to A/c 0001 1122 2333, IFSC test0000001', { amounts: [], texts }).map(
        (f) => f.label,
      ),
    ).toEqual(['Operator A bank account', 'Operator A IFSC']);
  });

  it('skips figures the document legitimately shows, and tiny amounts', () => {
    // An extra passed through at cost: its cost equals its price, which the client sees.
    expect(
      findLeaks('Ground transfer ₹20,000 · 12 Dec 2026', {
        amounts: [
          { label: 'Transfer cost', paise: 20_000_00 },
          { label: 'Tiny margin', paise: 2026_00 / 10 },
        ],
        allowedAmounts: [20_000_00],
      }),
    ).toEqual([]);
  });

  it('does not match a forbidden amount inside a bigger number', () => {
    expect(findLeaks('₹14,75,000', { amounts })).toEqual([]);
  });
});
