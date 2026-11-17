import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  financialYear,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatTime,
  istToInstant,
  parseIsoDate,
  toIstDate,
} from '../src/index.js';

describe('IST dates', () => {
  it('converts UTC instants to IST calendar dates', () => {
    expect(toIstDate(new Date('2026-12-11T18:29:00Z'))).toBe('2026-12-11');
    expect(toIstDate(new Date('2026-12-11T18:30:00Z'))).toBe('2026-12-12');
  });

  it('converts IST wall-clock time to an instant', () => {
    expect(istToInstant('2026-12-12', '09:30').toISOString()).toBe('2026-12-12T04:00:00.000Z');
    expect(istToInstant('2026-12-12').toISOString()).toBe('2026-12-11T18:30:00.000Z');
    expect(() => istToInstant('2026-12-12', '25:00')).toThrow(RangeError);
  });

  it('formats in Indian style', () => {
    expect(formatDate('2026-12-12')).toBe('12 Dec 2026');
    expect(formatDate(new Date('2026-12-11T20:00:00Z'))).toBe('12 Dec 2026');
    expect(formatDayMonth('2027-01-05')).toBe('5 Jan');
    expect(formatTime(new Date('2026-12-12T03:35:00Z'))).toBe('9:05 am');
    expect(formatTime(new Date('2026-12-12T06:30:00Z'))).toBe('12:00 pm');
    expect(formatTime(new Date('2026-12-11T18:30:00Z'))).toBe('12:00 am');
    expect(formatDateTime(new Date('2026-12-12T10:00:00Z'))).toBe('12 Dec 2026, 3:30 pm IST');
  });

  it('validates calendar dates', () => {
    expect(() => parseIsoDate('2026-02-30')).toThrow(RangeError);
    expect(() => parseIsoDate('12/12/2026')).toThrow(RangeError);
    expect(parseIsoDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('works out the Indian financial year', () => {
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2099-12-01')).toBe('2099-00');
    // 31 Mar 2027 20:00 UTC is already 1 Apr in IST
    expect(financialYear(new Date('2027-03-31T20:00:00Z'))).toBe('2027-28');
  });

  it('adds and counts days', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-12-12', '2026-12-14')).toBe(2);
    expect(daysBetween('2026-12-14', '2026-12-12')).toBe(-2);
  });
});
