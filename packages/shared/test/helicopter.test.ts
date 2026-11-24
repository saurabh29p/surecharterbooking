import { describe, expect, it } from 'vitest';
import {
  confirmationChecklist,
  flyingTimeText,
  heliChecklist,
  heliChecksMissing,
  hourlyInternalAmounts,
  hourlyNet,
  isHelicopter,
  moneyPosition,
  pricingProblem,
  rankOperatorsForLeg,
  siteLabel,
} from '../src/index.js';
import { buildTodayActions, type TodayFacts } from '../src/today.js';

const L = 1_00_000_00;

describe('helicopters', () => {
  it('prices per flying hour plus positioning and waiting', () => {
    const p = {
      hourlyRate: 2.4 * L,
      flyingMinutes: 90,
      positioning: 60_000_00,
      waiting: 25_000_00,
    };
    expect(hourlyNet(p)).toBe(3.6 * L + 85_000_00);
    expect(hourlyInternalAmounts(p)).toEqual([2.4 * L, 60_000_00, 25_000_00, 4.45 * L]);
    expect(pricingProblem({ ...p, flyingMinutes: 0 })).toBe('Enter the flying time');
    expect(flyingTimeText(90)).toBe('1 h 30 min');
    expect(flyingTimeText(45)).toBe('45 min');
  });

  it('asks for flower-shower approval only for a flower shower', () => {
    expect(heliChecklist('BRIDE_GROOM_ENTRY', {}).map((i) => i.key)).toEqual([
      'landingSite',
      'localPermission',
      'weatherBackup',
    ]);
    expect(
      heliChecklist('FLOWER_SHOWER', { landingSite: { done: true } }).map((i) => [i.key, i.done]),
    ).toEqual([
      ['landingSite', true],
      ['localPermission', false],
      ['flowerShower', false],
      ['weatherBackup', false],
    ]);
    expect(
      heliChecksMissing('TRANSFER', {
        landingSite: { done: true },
        localPermission: { done: true },
        weatherBackup: { done: true },
      }),
    ).toEqual([]);
  });

  it('labels venues and helipads', () => {
    expect(siteLabel({ name: 'Taj Lake Palace helipad', city: 'Udaipur', mapUrl: null })).toBe(
      'Taj Lake Palace helipad, Udaipur',
    );
    expect(siteLabel({ name: 'Udaipur polo ground', city: 'Udaipur', mapUrl: null })).toBe(
      'Udaipur polo ground',
    );
  });

  it('never offers a helicopter for a jet leg, or a jet for a helicopter leg', () => {
    const ops = [
      {
        id: 'jet',
        name: 'Jet Co',
        bases: ['UDR'],
        avgReplyHours: null,
        priceIndex: null,
        dgcaRank: null,
        aircraft: [{ category: 'MIDSIZE' as const, seats: 8, baseAirport: 'UDR' }],
      },
      {
        id: 'heli',
        name: 'Heli Co',
        bases: ['UDR'],
        avgReplyHours: null,
        priceIndex: null,
        dgcaRank: null,
        aircraft: [{ category: 'HELICOPTER_TWIN' as const, seats: 6, baseAirport: 'UDR' }],
      },
    ];
    expect(
      rankOperatorsForLeg(
        { from: 'UDR', to: 'UDR', pax: 4, category: 'HELICOPTER_SINGLE' },
        ops,
      ).map((o) => o.id),
    ).toEqual(['heli']);
    expect(
      rankOperatorsForLeg({ from: 'DEL', to: 'UDR', pax: 4, category: null }, ops).map((o) => o.id),
    ).toEqual(['jet']);
    expect(isHelicopter('HELICOPTER_TWIN')).toBe(true);
    expect(isHelicopter('HEAVY')).toBe(false);
  });

  it('blocks confirming until the permissions are complete', () => {
    const position = moneyPosition(10 * L, 10_000, [
      { direction: 'CLIENT_IN', amount: 10 * L, status: 'RECORDED' },
    ]);
    const open = confirmationChecklist({
      hasAcceptedQuote: true,
      termsSigned: true,
      position,
      hasHelicopter: true,
      heliPending: ['Leg 3: Local permission in hand'],
    });
    expect(open.at(-1)).toMatchObject({ key: 'helicopter', done: false });
    expect(open.at(-1)!.hint).toContain('Leg 3: Local permission in hand');
    const ok = confirmationChecklist({
      hasAcceptedQuote: true,
      termsSigned: true,
      position,
      hasHelicopter: true,
      heliPending: [],
    });
    expect(ok.every((i) => i.done)).toBe(true);
    // Jets only: no helicopter item at all.
    expect(
      confirmationChecklist({ hasAcceptedQuote: true, termsSigned: true, position }).map(
        (i) => i.key,
      ),
    ).toEqual(['quote', 'terms', 'payment']);
  });

  it('keeps open permissions on Today, more urgent as the flight nears', () => {
    const facts = {
      enquiries: [],
      rateWaits: [],
      quoteNeeded: [],
      quotes: [],
      confirmations: [],
      guestIds: [],
      flown: [],
      payouts: [],
      commissions: [],
      followUps: [],
      expiries: [],
      profile: null,
      heliPermissions: [
        {
          weddingId: 'w1',
          code: 'W-101',
          legId: 'l3',
          seq: 3,
          flightDate: '2026-11-22',
          service: 'FLOWER_SHOWER' as const,
          missing: ['Local permission in hand', 'Flower-shower approval'],
        },
        {
          weddingId: 'w2',
          code: 'W-102',
          legId: 'l9',
          seq: 1,
          flightDate: '2027-02-01',
          service: 'TRANSFER' as const,
          missing: ['Weather backup plan agreed'],
        },
        {
          weddingId: 'w3',
          code: 'W-103',
          legId: 'l7',
          seq: 2,
          flightDate: '2026-11-25',
          service: 'JOYRIDE' as const,
          missing: [],
        },
      ],
    } satisfies TodayFacts;
    const actions = buildTodayActions(facts, {
      now: new Date('2026-11-18T04:30:00Z'),
      today: '2026-11-18',
      brand: 'Vaanika',
      chaseAfterHours: 2,
      quoteWarnHours: 6,
      guestIdsDueDays: 7,
    });
    expect(actions.map((a) => [a.urgency, a.title])).toEqual([
      ['NOW', 'W-101: helicopter leg 3 needs 2 permissions'],
      ['SOON', 'W-102: helicopter leg 1 needs 1 permission'],
    ]);
    expect(actions[0]!.detail).toBe(
      'Local permission in hand · Flower-shower approval. Flies in 4 days.',
    );
  });
});
