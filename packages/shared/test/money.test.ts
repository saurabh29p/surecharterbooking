import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  allocateProportionally,
  applyBps,
  divRound,
  formatBps,
  formatINR,
  formatINRShort,
  groupIndian,
  mulDivRound,
  parsePercent,
  parseRupees,
  ratioBps,
  sumPaise,
} from '../src/index.js';

describe('Indian number formatting', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['100000', '1,00,000'],
    ['12345678', '1,23,45,678'],
    ['1000000000', '1,00,00,00,000'],
  ])('groups %s as %s', (input, expected) => {
    expect(groupIndian(input)).toBe(expected);
  });

  it('formats paise as ₹ with Indian grouping', () => {
    expect(formatINR(12345678_00)).toBe('₹1,23,45,678');
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(123450)).toBe('₹1,234.50');
    expect(formatINR(123405)).toBe('₹1,234.05');
    expect(formatINR(-250000)).toBe('-₹2,500');
    expect(formatINR(1234_00, { paise: 'always' })).toBe('₹1,234.00');
    expect(formatINR(1234_50, { paise: 'never' })).toBe('₹1,235');
    expect(formatINR(1234_49, { paise: 'never' })).toBe('₹1,234');
    expect(formatINR(1234_00, { symbol: false })).toBe('1,234');
  });

  it('formats compact lakh / crore values', () => {
    expect(formatINRShort(24_00_000_00)).toBe('₹24.0L');
    expect(formatINRShort(1_20_00_000_00)).toBe('₹1.2Cr');
    expect(formatINRShort(1_00_000_00)).toBe('₹1.0L');
    expect(formatINRShort(2_45_000_00)).toBe('₹2.5L'); // 2.45 rounds half up
    expect(formatINRShort(99_99_000_00)).toBe('₹1.0Cr'); // 99.99L rounds to 100.0L
    expect(formatINRShort(85_000_00)).toBe('₹85,000');
    expect(formatINRShort(-24_00_000_00)).toBe('-₹24.0L');
    expect(formatINRShort(12_34_00_000_00)).toBe('₹12.3Cr');
  });

  it('rejects non-integer paise', () => {
    expect(() => formatINR(10.5)).toThrow(MoneyError);
    expect(() => formatINR(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });
});

describe('parsing user input', () => {
  it.each([
    ['1,23,456.50', 12345650],
    ['₹ 24000', 2400000],
    ['2400.5', 240050],
    ['Rs. 100', 10000],
    ['0', 0],
    ['-500', -50000],
  ])('parses %s', (input, expected) => {
    expect(parseRupees(input)).toBe(expected);
  });

  it('parses numbers', () => {
    expect(parseRupees(1999.99)).toBe(199999);
  });

  it.each(['', 'abc', '12.345', '1.2.3', '₹'])('rejects %j', (input) => {
    expect(() => parseRupees(input)).toThrow(MoneyError);
  });

  it('parses and formats percentages as basis points', () => {
    expect(parsePercent('10')).toBe(1000);
    expect(parsePercent('12.5%')).toBe(1250);
    expect(parsePercent(18)).toBe(1800);
    expect(() => parsePercent('abc')).toThrow(MoneyError);
    expect(formatBps(1000)).toBe('10%');
    expect(formatBps(1250)).toBe('12.5%');
    expect(formatBps(1234)).toBe('12.34%');
  });
});

describe('integer maths', () => {
  it('rounds half away from zero', () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(0, 7)).toBe(0);
    expect(() => divRound(1, 0)).toThrow(MoneyError);
  });

  it('applies basis points exactly', () => {
    expect(applyBps(10_00_000_00, 1000)).toBe(1_00_000_00); // 10% of ₹10L
    expect(applyBps(1, 5000)).toBe(1); // 0.5 paise rounds up
    expect(applyBps(-1, 5000)).toBe(-1);
    expect(applyBps(333, 3333)).toBe(111);
  });

  it('does not overflow on large amounts', () => {
    const big = 9_00_00_00_00_000_00; // ₹9,000 Cr in paise
    expect(applyBps(big, 1800)).toBe(1_62_00_00_00_000_00);
    expect(mulDivRound(big, 10_000, 10_000)).toBe(big);
  });

  it('computes ratios in bps', () => {
    expect(ratioBps(1_000, 10_000)).toBe(1000);
    expect(ratioBps(1, 3)).toBe(3333);
    expect(ratioBps(5, 0)).toBe(0);
    expect(ratioBps(-1_000, 10_000)).toBe(-1000);
  });

  it('sums paise and rejects fractions', () => {
    expect(sumPaise([100, 200, -50])).toBe(250);
    expect(() => sumPaise([1.5])).toThrow(MoneyError);
  });
});

describe('allocateProportionally', () => {
  it('splits so parts add up to the total exactly', () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts).toEqual([34, 33, 33]);
    expect(parts.reduce((a, b) => a + b)).toBe(100);
  });

  it('follows weights', () => {
    expect(allocateProportionally(10_00_000_00, [3, 1])).toEqual([7_50_000_00, 2_50_000_00]);
  });

  it('splits evenly when all weights are zero', () => {
    expect(allocateProportionally(10, [0, 0])).toEqual([5, 5]);
  });

  it('handles negative totals', () => {
    expect(allocateProportionally(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it('rejects bad input', () => {
    expect(() => allocateProportionally(100, [])).toThrow(MoneyError);
    expect(() => allocateProportionally(100, [-1, 2])).toThrow(MoneyError);
  });
});
