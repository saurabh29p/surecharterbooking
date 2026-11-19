/** Weddings, legs and rates (BRIEF.md §2, §4): labels and the pure rules the API and desk share. */
import { formatDate, type IsoDate } from './dates.js';
import { formatINR, type Paise } from './money.js';
import { CATEGORY_LABELS, isHelicopter, type AircraftCategory } from './operator.js';

export type WeddingStatus =
  'ENQUIRY' | 'RATES_REQUESTED' | 'QUOTED' | 'SIGNED_AND_PAID' | 'FLYING' | 'DONE' | 'LOST';
export type LeadSource =
  'PARTNER' | 'NETWORK' | 'HOTEL' | 'WEBSITE' | 'GOOGLE_ADS' | 'INSTAGRAM' | 'OTHER';
export type LegStatus =
  | 'OPEN'
  | 'RATES_REQUESTED'
  | 'RATES_IN'
  | 'CHOSEN'
  | 'QUOTED'
  | 'CONFIRMED'
  | 'FLOWN'
  | 'CANCELLED';

export const WEDDING_STATUSES: readonly WeddingStatus[] = [
  'ENQUIRY',
  'RATES_REQUESTED',
  'QUOTED',
  'SIGNED_AND_PAID',
  'FLYING',
  'DONE',
  'LOST',
];
export const WEDDING_STATUS_LABELS: Record<WeddingStatus, string> = {
  ENQUIRY: 'Enquiry',
  RATES_REQUESTED: 'Rates requested',
  QUOTED: 'Quoted',
  SIGNED_AND_PAID: 'Signed and paid',
  FLYING: 'Flying',
  DONE: 'Done',
  LOST: 'Lost',
};

export const LEAD_SOURCES: readonly LeadSource[] = [
  'PARTNER',
  'NETWORK',
  'HOTEL',
  'WEBSITE',
  'GOOGLE_ADS',
  'INSTAGRAM',
  'OTHER',
];
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  PARTNER: 'Partner (planner)',
  NETWORK: 'My network',
  HOTEL: 'Hotel wedding team',
  WEBSITE: 'Website',
  GOOGLE_ADS: 'Google Ads',
  INSTAGRAM: 'Instagram',
  OTHER: 'Other',
};

export const LEG_STATUS_LABELS: Record<LegStatus, string> = {
  OPEN: 'Needs rates',
  RATES_REQUESTED: 'Rates requested',
  RATES_IN: 'Rates in',
  CHOSEN: 'Jet chosen',
  QUOTED: 'Quoted',
  CONFIRMED: 'Confirmed',
  FLOWN: 'Flown',
  CANCELLED: 'Cancelled',
};

/** Statuses you set by hand; the rest follow from what happens (rates requested, quote shared, paid…). */
export const MANUAL_WEDDING_MOVES: Partial<Record<WeddingStatus, readonly WeddingStatus[]>> = {
  ENQUIRY: ['LOST'],
  RATES_REQUESTED: ['LOST'],
  QUOTED: ['LOST'],
  LOST: ['ENQUIRY'],
};

/** Size within a family: fixed-wing (turboprop … heavy jet) or helicopters (single, twin). */
const SIZE: Record<AircraftCategory, number> = {
  TURBOPROP: 0,
  LIGHT: 1,
  MIDSIZE: 2,
  SUPER_MIDSIZE: 3,
  HEAVY: 4,
  HELICOPTER_SINGLE: 0,
  HELICOPTER_TWIN: 1,
};

export interface RankAircraft {
  category: AircraftCategory;
  seats: number;
  baseAirport: string | null;
}

export interface RankOperator {
  id: string;
  name: string;
  bases: string[];
  aircraft: RankAircraft[];
  avgReplyHours: number | null;
  /** Their average quoted cost compared with others on the same legs: 1.0 = average, 0.9 = 10% cheaper. */
  priceIndex: number | null;
  dgcaRank: number | null;
}

export interface RankLeg {
  from: string;
  to: string;
  pax: number;
  category: AircraftCategory | null;
}

export interface RankedOperator {
  id: string;
  name: string;
  score: number;
  /** Plain reasons shown next to each suggestion. */
  reasons: string[];
  /** Fewest jets of the right size needed to seat everyone (null when they can't). */
  jetsNeeded: number | null;
}

/**
 * Rank verified operators for one leg (BRIEF.md §6.3: category, seats, base vs departure, reply speed, past prices).
 * Pure code, no AI. Operators that can't seat the group at all are left out.
 */
export function rankOperatorsForLeg(
  leg: RankLeg,
  operators: readonly RankOperator[],
): RankedOperator[] {
  const out: RankedOperator[] = [];
  for (const op of operators) {
    const wanted = leg.category ? SIZE[leg.category] : -1;
    // A helicopter leg needs helicopters; a jet leg (or one with no category yet) never gets one.
    const heliLeg = isHelicopter(leg.category);
    const fit = op.aircraft
      .filter((a) => isHelicopter(a.category) === heliLeg && SIZE[a.category] >= wanted)
      .sort((a, b) => b.seats - a.seats);
    if (!fit.length) continue;
    // Greedy: biggest suitable jets first until everyone has a seat.
    let seats = 0;
    let jets = 0;
    for (const a of fit) {
      if (seats >= leg.pax) break;
      seats += a.seats;
      jets++;
    }
    if (seats < leg.pax) continue;
    const reasons: string[] = [];
    let score = 50;
    const exact = leg.category ? fit.filter((a) => a.category === leg.category) : fit;
    if (leg.category && exact.length) {
      score += 15;
      reasons.push(
        `Has ${exact.length} ${CATEGORY_LABELS[leg.category].toLowerCase()}${exact.length === 1 ? '' : 's'}`,
      );
    } else if (leg.category) {
      reasons.push(`Larger than asked (${CATEGORY_LABELS[fit[0]!.category].toLowerCase()})`);
    }
    if (jets === 1) {
      score += 10;
      reasons.push(`One jet seats all ${leg.pax}`);
    } else {
      reasons.push(`Needs ${jets} jets for ${leg.pax} guests`);
      score -= 5 * (jets - 1);
    }
    if (op.bases.includes(leg.from) || op.aircraft.some((a) => a.baseAirport === leg.from)) {
      score += 20;
      reasons.push(`Based at ${leg.from} (no positioning flight)`);
    } else if (op.bases.includes(leg.to)) {
      score += 8;
      reasons.push(`Based at ${leg.to}`);
    }
    if (op.avgReplyHours !== null) {
      score += op.avgReplyHours <= 2 ? 10 : op.avgReplyHours <= 6 ? 5 : 0;
      reasons.push(`Replies in ~${op.avgReplyHours} h`);
    }
    if (op.priceIndex !== null) {
      score += Math.round((1 - op.priceIndex) * 40);
      if (op.priceIndex <= 0.97)
        reasons.push(`Usually ${Math.round((1 - op.priceIndex) * 100)}% below others`);
      if (op.priceIndex >= 1.03)
        reasons.push(`Usually ${Math.round((op.priceIndex - 1) * 100)}% above others`);
    }
    if (op.dgcaRank !== null && op.dgcaRank <= 10) {
      score += 5;
      reasons.push(`DGCA safety rank ${op.dgcaRank}`);
    }
    out.push({ id: op.id, name: op.name, score, reasons, jetsNeeded: jets });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export interface MessageLeg {
  seq: number;
  from: string;
  to: string;
  fromCity: string;
  toCity: string;
  date: IsoDate;
  windowFrom: string | null;
  windowTo: string | null;
  pax: number;
  category: AircraftCategory | null;
}

/** The rate-request message you send to an operator yourself (WhatsApp or email). Plain template, no AI. */
export function rateRequestMessage(input: {
  operatorName: string;
  weddingCode: string;
  venueCity: string | null;
  legs: readonly MessageLeg[];
  brand: string;
}): string {
  const lines = input.legs.map((l) => {
    const time = l.windowFrom ? `, ${l.windowFrom}${l.windowTo ? `–${l.windowTo}` : ''}` : '';
    const size = l.category ? `, ${CATEGORY_LABELS[l.category].toLowerCase()} or larger` : '';
    return `• Leg ${l.seq}: ${l.fromCity} (${l.from}) → ${l.toCity} (${l.to}), ${formatDate(l.date)}${time}, ${l.pax} passengers${size}`;
  });
  return [
    `Hello ${input.operatorName} team,`,
    ``,
    `Rate request from ${input.brand} for a wedding${input.venueCity ? ` in ${input.venueCity}` : ''} (ref ${input.weddingCode}):`,
    ...lines,
    ``,
    `Please share for each leg: aircraft type and registration, seats, all-inclusive net rate, what is included and excluded, cancellation terms, and how long the rate is valid.`,
    ``,
    `Thank you.`,
  ].join('\n');
}

/** Split a package rate across the legs it covers (equal shares unless weights are given), adding up exactly. */
export { allocateProportionally as splitPackage } from './money.js';

/** "₹4,75,000 per leg · ₹59,375 per seat" for comparison rows. */
export function perSeat(cost: Paise, seats: number | null): string | null {
  return seats && seats > 0 ? formatINR(Math.round(cost / seats), { paise: 'never' }) : null;
}
