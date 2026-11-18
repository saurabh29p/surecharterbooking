import {
  chargeAt,
  describeWindow,
  type CancellationSchedule,
  type CommissionBasis,
  type InvoicingModel,
  type PaymentPart,
  type QuoteStatus,
  type QuoteTotals,
  type ScheduleGap,
} from '@shubhjets/shared';

export interface QuoteSummary {
  id: string;
  version: number;
  reference: string;
  status: QuoteStatus;
  total: number;
  validUntil: string | null;
  issuedAt: string | null;
  sharedAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
}

export interface QuoteJetLine {
  id: string;
  rateResponseId: string;
  operator: { id: string; name: string };
  aircraft: string;
  seats: number | null;
  cost: number;
  markupType: 'PERCENT' | 'FIXED';
  markupValue: number;
  sell: number;
  margin: number;
  rateValidUntil: string | null;
  rateExpired: boolean;
  quotable: { ok: boolean; reason: string | null };
}

export interface QuoteLegView {
  legId: string;
  seq: number;
  from: string;
  to: string;
  date: string;
  windowFrom: string | null;
  windowTo: string | null;
  pax: number;
  seats: number;
  cost: number;
  sell: number;
  lines: QuoteJetLine[];
}

export interface OperatorTerms {
  rateResponseId: string;
  operator: { id: string; name: string };
  aircraft: string | null;
  schedule: CancellationSchedule | null;
  terms: string | null;
  gaps: ScheduleGap[];
  gapText: string[];
}

export interface QuoteDetail {
  id: string;
  weddingId: string;
  weddingCode: string;
  version: number;
  reference: string;
  status: QuoteStatus;
  validityHours: number;
  validUntil: string | null;
  issuedAt: string | null;
  sharedAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
  businessProfile: { id: string; label: string };
  legs: QuoteLegView[];
  extras: { id: string; description: string; cost: number; sell: number; margin: number }[];
  cancellation: {
    ours: CancellationSchedule;
    note: string | null;
    operators: OperatorTerms[];
    looser: boolean;
    fix: CancellationSchedule | null;
  };
  gst: {
    rateBps: number;
    sac: string | null;
    model: InvoicingModel;
    placeOfSupplyState: string | null;
  };
  paymentPlanBps: number[];
  payment: PaymentPart[];
  inclusions: string | null;
  exclusions: string | null;
  totals: QuoteTotals;
  commission: { basis: CommissionBasis; bps: number } | null;
  blockers: string[];
  warnings: string[];
}

export interface ShareRow {
  id: string;
  channel: string;
  recipient: string | null;
  sharedAt: string;
}

export const PAYMENT_PLANS: ReadonlyArray<{ label: string; plan: number[] }> = [
  { label: 'Full payment to confirm', plan: [10_000] },
  { label: '50% advance, 50% before the flight', plan: [5_000, 5_000] },
  { label: '30% advance, 70% before the flight', plan: [3_000, 7_000] },
  { label: '25% advance, 75% before the flight', plan: [2_500, 7_500] },
];

export const SHARE_CHANNELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'MESSENGER', label: 'Messenger' },
  { value: 'WEB_SHARE', label: 'Phone share sheet' },
  { value: 'DOWNLOAD', label: 'Downloaded and sent another way' },
];

export interface ComparisonRow {
  when: string;
  ours: number;
  theirs: Array<number | null>;
  /** Ours keep less than at least one operator here. */
  looser: boolean;
}

/** Our charges and each operator's, window by window, for the side-by-side table. */
export function compareSchedules(
  ours: CancellationSchedule,
  operators: ReadonlyArray<CancellationSchedule | null>,
): ComparisonRow[] {
  const points = new Set<number>([0]);
  for (const s of [ours, ...operators]) for (const t of s ?? []) points.add(t.minDays);
  const sorted = [...points].sort((a, b) => b - a);
  return sorted.map((from, i) => {
    const to = i === 0 ? null : sorted[i - 1]!;
    const o = chargeAt(ours, from);
    const theirs = operators.map((s) => (s ? chargeAt(s, from) : null));
    return {
      when: describeWindow(from, to).replace(' before departure', ''),
      ours: o,
      theirs,
      looser: theirs.some((t) => t !== null && t > o),
    };
  });
}

/** "in 5 h", "in 2 days", "3 h ago". */
export function relativeTime(iso: string, now = new Date()): string {
  const h = (new Date(iso).getTime() - now.getTime()) / 3_600_000;
  const abs = Math.abs(h);
  const text =
    abs < 1
      ? `${Math.max(1, Math.round(abs * 60))} min`
      : abs < 48
        ? `${Math.round(abs)} h`
        : `${Math.round(abs / 24)} days`;
  return h >= 0 ? `in ${text}` : `${text} ago`;
}
