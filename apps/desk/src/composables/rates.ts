import {
  flyingTimeText,
  formatINR,
  type AircraftCategory,
  type HourlyPricing,
} from '@shubhjets/shared';

export interface RateRequestRow {
  id: string;
  operator: { id: string; name: string };
  channel: string;
  sentAt: string;
  legIds: string[];
  replied: boolean;
  replyHours: number | null;
  waitingHours: number | null;
  overdue: boolean;
}

export interface ReplyRow {
  id: string;
  operator: { id: string; name: string };
  rateRequestId: string | null;
  aircraftId: string | null;
  aircraft: string;
  category: AircraftCategory | null;
  seats: number | null;
  netRate: number;
  /** Helicopter replies priced per flying hour (internal). */
  pricing: HourlyPricing | null;
  legs: { legId: string; costShare: number }[];
  isPackage: boolean;
  inclusions: string | null;
  exclusions: string | null;
  cancellationTerms: string | null;
  validUntil: string | null;
  expired: boolean;
  receivedAt: string;
  replyHours: number | null;
  quotable: { ok: boolean; reason: string | null };
}

export interface ComparisonRow {
  responseId: string;
  operator: { id: string; name: string };
  aircraft: string;
  category: AircraftCategory | null;
  seats: number | null;
  cost: number;
  perSeat: number | null;
  isPackage: boolean;
  netRate: number;
  pricing: HourlyPricing | null;
  validUntil: string | null;
  expired: boolean;
  replyHours: number | null;
  quotable: { ok: boolean; reason: string | null };
  seatsCoverPax: boolean;
  chosen: boolean;
}

export interface LegComparison {
  legId: string;
  seq: number;
  from: string;
  to: string;
  date: string;
  pax: number;
  category: AircraftCategory | null;
  status: string;
  rows: ComparisonRow[];
  cheapestId: string | null;
  chosenSeats: number;
  chosenCost: number;
}

export interface RatesOverview {
  requests: RateRequestRow[];
  replies: ReplyRow[];
  comparison: LegComparison[];
  summary: { asked: number; replied: number; overdue: number; legsChosen: number; legs: number };
}

export interface Suggestion {
  id: string;
  name: string;
  score: number;
  reasons: string[];
  jetsNeeded: number | null;
  alreadyAsked: boolean;
}

export interface RequestResult {
  requestId: string;
  operator: { id: string; name: string; phone: string | null; email: string | null };
  message: string;
  whatsappUrl: string | null;
  mailtoUrl: string | null;
}

/** "6 h" / "2 days" for waiting and reply times. */
export function hoursText(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round(h / 24)} days`;
}

/** Why a rate can't be chosen right now (null when it can). */
export function blocker(row: ComparisonRow): string | null {
  if (!row.quotable.ok) return `Can't quote: ${row.quotable.reason}`;
  if (row.expired) return 'Rate expired: ask them to confirm it';
  if (!row.seats) return 'Add the seats first';
  return null;
}

/** "₹2,40,000/hr × 30 min + positioning ₹60,000 + waiting ₹25,000" (internal only). */
export function hourlyBreakdown(p: HourlyPricing): string {
  const r = (v: number) => formatINR(v, { paise: 'never' });
  return [
    `${r(p.hourlyRate)}/hr × ${flyingTimeText(p.flyingMinutes)}`,
    p.positioning ? `positioning ${r(p.positioning)}` : '',
    p.waiting ? `waiting ${r(p.waiting)}` : '',
  ]
    .filter(Boolean)
    .join(' + ');
}
