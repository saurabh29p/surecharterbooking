import { describe, expect, it } from 'vitest';
import { compareSchedules, relativeTime } from '../src/composables/quotes';

describe('quote helpers', () => {
  it('lines up our cancellation charges with each operator’s, window by window', () => {
    const ours = [
      { minDays: 30, chargeBps: 1000 },
      { minDays: 7, chargeBps: 5000 },
      { minDays: 0, chargeBps: 10000 },
    ];
    const opA = [
      { minDays: 7, chargeBps: 1000 },
      { minDays: 3, chargeBps: 5000 },
      { minDays: 0, chargeBps: 10000 },
    ];
    const rows = compareSchedules(ours, [opA, null]);
    expect(rows.map((r) => [r.when, r.ours, ...r.theirs, r.looser])).toEqual([
      ['30 days or more', 1000, 1000, null, false],
      ['7 to 30 days', 5000, 1000, null, false],
      ['3 to 7 days', 10000, 5000, null, false],
      ['Less than 3 days', 10000, 10000, null, false],
    ]);
    const loose = compareSchedules([{ minDays: 0, chargeBps: 5000 }], [opA]);
    expect(loose.filter((r) => r.looser).map((r) => r.when)).toEqual(['Less than 3 days']);
  });

  it('says when in plain words', () => {
    const now = new Date('2026-11-18T06:00:00Z');
    expect(relativeTime('2026-11-18T11:00:00Z', now)).toBe('in 5 h');
    expect(relativeTime('2026-11-21T06:00:00Z', now)).toBe('in 3 days');
    expect(relativeTime('2026-11-18T05:30:00Z', now)).toBe('30 min ago');
  });
});
