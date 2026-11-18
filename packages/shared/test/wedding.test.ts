import { describe, expect, it } from 'vitest';
import {
  perSeat,
  rankOperatorsForLeg,
  rateRequestMessage,
  splitPackage,
  type RankOperator,
} from '../src/index.js';

const op = (o: Partial<RankOperator> & { id: string }): RankOperator => ({
  name: o.id,
  bases: [],
  aircraft: [],
  avgReplyHours: null,
  priceIndex: null,
  dgcaRank: null,
  ...o,
});

describe('rankOperatorsForLeg', () => {
  const leg = { from: 'DEL', to: 'UDR', pax: 8, category: 'MIDSIZE' as const };

  it('prefers operators based at the departure airport with the right jets, and explains why', () => {
    const ranked = rankOperatorsForLeg(leg, [
      op({
        id: 'Far',
        bases: ['BOM'],
        aircraft: [{ category: 'MIDSIZE', seats: 8, baseAirport: 'BOM' }],
      }),
      op({
        id: 'Near',
        bases: ['DEL'],
        aircraft: [{ category: 'MIDSIZE', seats: 8, baseAirport: 'DEL' }],
        avgReplyHours: 2,
      }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['Near', 'Far']);
    expect(ranked[0]!.reasons).toEqual([
      'Has 1 midsize jet',
      'One jet seats all 8',
      'Based at DEL (no positioning flight)',
      'Replies in ~2 h',
    ]);
  });

  it('counts how many jets a big group needs, and leaves out operators who cannot seat everyone', () => {
    const ranked = rankOperatorsForLeg({ ...leg, pax: 18 }, [
      op({
        id: 'Two jets',
        aircraft: [
          { category: 'SUPER_MIDSIZE', seats: 10, baseAirport: null },
          { category: 'MIDSIZE', seats: 8, baseAirport: null },
        ],
      }),
      op({ id: 'Too small', aircraft: [{ category: 'MIDSIZE', seats: 8, baseAirport: null }] }),
      op({
        id: 'Turboprops only',
        aircraft: [{ category: 'TURBOPROP', seats: 20, baseAirport: null }],
      }),
    ]);
    expect(ranked.map((r) => [r.id, r.jetsNeeded])).toEqual([['Two jets', 2]]);
  });

  it('uses price history and safety rank', () => {
    const base = { aircraft: [{ category: 'MIDSIZE' as const, seats: 8, baseAirport: null }] };
    const ranked = rankOperatorsForLeg(leg, [
      op({ id: 'Pricey', priceIndex: 1.1, ...base }),
      op({ id: 'Cheap', priceIndex: 0.9, dgcaRank: 3, ...base }),
    ]);
    expect(ranked[0]).toMatchObject({
      id: 'Cheap',
      reasons: expect.arrayContaining(['Usually 10% below others', 'DGCA safety rank 3']),
    });
    expect(ranked[1]!.reasons).toContain('Usually 10% above others');
  });
});

describe('rate request message', () => {
  it('lists each leg plainly and asks for everything needed to compare', () => {
    const text = rateRequestMessage({
      operatorName: 'Operator A',
      weddingCode: 'W-102',
      venueCity: 'Jaipur',
      brand: 'ShubhJets',
      legs: [
        {
          seq: 1,
          from: 'DEL',
          to: 'JAI',
          fromCity: 'New Delhi',
          toCity: 'Jaipur',
          date: '2026-12-08',
          windowFrom: '09:00',
          windowTo: '12:00',
          pax: 8,
          category: 'MIDSIZE',
        },
        {
          seq: 2,
          from: 'JAI',
          to: 'DEL',
          fromCity: 'Jaipur',
          toCity: 'New Delhi',
          date: '2026-12-11',
          windowFrom: null,
          windowTo: null,
          pax: 8,
          category: null,
        },
      ],
    });
    expect(text).toContain('Rate request from ShubhJets for a wedding in Jaipur (ref W-102):');
    expect(text).toContain(
      '• Leg 1: New Delhi (DEL) → Jaipur (JAI), 8 Dec 2026, 09:00–12:00, 8 passengers, midsize jet or larger',
    );
    expect(text).toContain('• Leg 2: Jaipur (JAI) → New Delhi (DEL), 11 Dec 2026, 8 passengers');
    expect(text).toMatch(/all-inclusive net rate/);
  });
});

describe('package rates', () => {
  it('split exactly across legs and show cost per seat', () => {
    expect(splitPackage(9_50_000_01, [1, 1])).toEqual([4_75_000_01, 4_75_000_00]);
    expect(perSeat(4_75_000_00, 8)).toBe('₹59,375');
    expect(perSeat(1, null)).toBeNull();
  });
});
