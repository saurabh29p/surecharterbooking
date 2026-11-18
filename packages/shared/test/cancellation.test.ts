import { describe, expect, it } from 'vitest';
import {
  chargeAt,
  describeGap,
  describeSchedule,
  looserGaps,
  normaliseSchedule,
  sameSchedule,
  scheduleProblem,
  strictestSchedule,
  type CancellationSchedule,
} from '../src/cancellation.js';

// Operator: more than 7 days 10%, 7 to 3 days 50%, under 3 days 100%.
const operator: CancellationSchedule = [
  { minDays: 7, chargeBps: 1000 },
  { minDays: 3, chargeBps: 5000 },
  { minDays: 0, chargeBps: 10000 },
];

describe('normaliseSchedule', () => {
  it('sorts lines furthest from departure first', () => {
    expect(
      normaliseSchedule([
        { minDays: 0, chargeBps: 10000 },
        { minDays: 30, chargeBps: 0 },
        { minDays: 7, chargeBps: 5000 },
      ]).map((t) => t.minDays),
    ).toEqual([30, 7, 0]);
  });

  it('explains what is wrong in plain words', () => {
    expect(scheduleProblem([])).toBe('Add at least one line');
    expect(scheduleProblem([{ minDays: 7, chargeBps: 1000 }])).toBe(
      'Add a line for cancellations close to departure (0 days)',
    );
    expect(
      scheduleProblem([
        { minDays: 7, chargeBps: 5000 },
        { minDays: 0, chargeBps: 1000 },
      ]),
    ).toBe('Charges should stay the same or rise as the flight gets closer');
    expect(
      scheduleProblem([
        { minDays: 0, chargeBps: 1000 },
        { minDays: 0, chargeBps: 2000 },
      ]),
    ).toBe('Two lines both start at 0 days');
    expect(scheduleProblem([{ minDays: 0, chargeBps: 10001 }])).toBe(
      'Charges must be between 0% and 100%',
    );
    expect(scheduleProblem([{ minDays: 1.5, chargeBps: 0 }])).toMatch(/whole number/);
    expect(scheduleProblem(operator)).toBeNull();
  });
});

describe('chargeAt', () => {
  it('reads the charge for any day before departure', () => {
    expect(chargeAt(operator, 40)).toBe(1000);
    expect(chargeAt(operator, 7)).toBe(1000);
    expect(chargeAt(operator, 6)).toBe(5000);
    expect(chargeAt(operator, 3)).toBe(5000);
    expect(chargeAt(operator, 2)).toBe(10000);
    expect(chargeAt(operator, 0)).toBe(10000);
  });
});

describe('looserGaps', () => {
  it('is empty when ours keep at least as much at every point', () => {
    const ours = normaliseSchedule([
      { minDays: 30, chargeBps: 1000 },
      { minDays: 7, chargeBps: 5000 },
      { minDays: 0, chargeBps: 10000 },
    ]);
    expect(looserGaps(ours, operator)).toEqual([]);
  });

  it('finds the exact window where we would refund more than the operator refunds us', () => {
    const ours = normaliseSchedule([
      { minDays: 7, chargeBps: 1000 },
      { minDays: 1, chargeBps: 5000 },
      { minDays: 0, chargeBps: 10000 },
    ]);
    const gaps = looserGaps(ours, operator);
    expect(gaps).toEqual([{ fromDays: 1, toDays: 3, oursBps: 5000, theirsBps: 10000 }]);
    expect(describeGap(gaps[0]!, 'Operator B')).toBe(
      '1 to 3 days before departure: Operator B keeps 100% but your terms keep only 50%.',
    );
  });

  it('merges neighbouring windows with the same charges and reports the far-out window', () => {
    const ours = normaliseSchedule([{ minDays: 0, chargeBps: 0 }]); // full refund any time
    expect(looserGaps(ours, operator)).toEqual([
      { fromDays: 7, toDays: null, oursBps: 0, theirsBps: 1000 },
      { fromDays: 3, toDays: 7, oursBps: 0, theirsBps: 5000 },
      { fromDays: 0, toDays: 3, oursBps: 0, theirsBps: 10000 },
    ]);
  });
});

describe('strictestSchedule', () => {
  it('takes the highest charge of every operator at every point', () => {
    const other = normaliseSchedule([
      { minDays: 14, chargeBps: 2500 },
      { minDays: 0, chargeBps: 7500 },
    ]);
    const strict = strictestSchedule([operator, other]);
    // 14+ days: 10% vs 25%; under 14 days the other keeps 75%; under 3 days ours keep 100%.
    expect(strict).toEqual([
      { minDays: 14, chargeBps: 2500 },
      { minDays: 3, chargeBps: 7500 },
      { minDays: 0, chargeBps: 10000 },
    ]);
    expect(looserGaps(strict, operator)).toEqual([]);
    expect(looserGaps(strict, other)).toEqual([]);
    expect(scheduleProblem(strict)).toBeNull();
  });

  it('compacts repeated charges', () => {
    expect(
      sameSchedule(
        [
          { minDays: 7, chargeBps: 5000 },
          { minDays: 3, chargeBps: 5000 },
          { minDays: 0, chargeBps: 10000 },
        ],
        [
          { minDays: 3, chargeBps: 5000 },
          { minDays: 0, chargeBps: 10000 },
        ],
      ),
    ).toBe(true);
  });
});

describe('describeSchedule', () => {
  it('writes the rows printed on the quote', () => {
    expect(describeSchedule([{ minDays: 30, chargeBps: 0 }, ...operator.slice(1)])).toEqual([
      { when: '30 days or more before departure', charge: 'No charge' },
      { when: '3 to 30 days before departure', charge: '50% of the charter price' },
      { when: 'Less than 3 days before departure', charge: '100% of the charter price' },
    ]);
    expect(describeSchedule([{ minDays: 0, chargeBps: 10000 }])).toEqual([
      { when: 'Any time before departure', charge: '100% of the charter price' },
    ]);
  });
});
