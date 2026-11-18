import { describe, expect, it } from 'vitest';
import { seasonRange, statusAfterActivity, websiteDomain } from '../src/index.js';

describe('partner pipeline', () => {
  it('moves forward from activities, never backwards, never past CALL_DONE', () => {
    expect(statusAfterActivity('IMPORTED', 'NO_ANSWER')).toBe('CONTACTED');
    expect(statusAfterActivity('IMPORTED', 'SENT_DECK')).toBe('CONTACTED');
    expect(statusAfterActivity('IMPORTED', 'CALLED')).toBe('CALL_DONE');
    expect(statusAfterActivity('CONTACTED', 'MET')).toBe('CALL_DONE');
    expect(statusAfterActivity('CALL_DONE', 'NO_ANSWER')).toBeNull();
    expect(statusAfterActivity('ACTIVE', 'CALLED')).toBeNull();
    expect(statusAfterActivity('INACTIVE', 'CALLED')).toBeNull();
    expect(statusAfterActivity('IMPORTED', 'NOTE')).toBeNull();
  });

  it('defines the season as the financial year', () => {
    expect(seasonRange('2026-11-18')).toEqual({
      label: '2026-27',
      from: '2026-04-01',
      to: '2027-03-31',
    });
    expect(seasonRange('2027-02-10').label).toBe('2026-27');
  });

  it('compares websites by domain', () => {
    expect(websiteDomain('https://www.Planner-P1.example.test/about')).toBe(
      'planner-p1.example.test',
    );
    expect(websiteDomain('planner-p1.example.test')).toBe('planner-p1.example.test');
    expect(websiteDomain('')).toBeNull();
    expect(websiteDomain('not a url')).toBeNull();
  });
});
