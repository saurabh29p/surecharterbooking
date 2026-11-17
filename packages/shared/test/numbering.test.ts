import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber, formatWeddingCode } from '../src/index.js';

describe('numbering', () => {
  it('formats wedding codes', () => {
    expect(formatWeddingCode(101)).toBe('W-101');
    expect(() => formatWeddingCode(0)).toThrow(RangeError);
  });

  it('formats invoice numbers per financial year', () => {
    expect(formatInvoiceNumber('SJ', '2026-12-12', 1)).toBe('SJ/2026-27/0001');
    expect(formatInvoiceNumber('sj', '2027-04-01', 12)).toBe('SJ/2027-28/0012');
    expect(formatInvoiceNumber('SJHR', '2026-12-12', 12345)).toBe('SJHR/2026-27/12345');
    expect(() => formatInvoiceNumber('S/J', '2026-12-12', 1)).toThrow(RangeError);
    expect(() => formatInvoiceNumber('SJ', '2026-12-12', 0)).toThrow(RangeError);
  });
});
