import type { LegSite } from './helicopter.js';
/**
 * Quotes: statuses, and the client-safe shape every outward quote document is built from.
 * `OutwardQuote` deliberately has no field for cost, net rate, margin, markup or commission:
 * the PDF template receives only this, so it cannot print what it was never given (hard rule 4).
 */
import type { CancellationSchedule } from './cancellation.js';
import { formatBps, type Bps, type Paise } from './money.js';
import { paymentSchedule } from './pricing.js';

export const QUOTE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'SHARED',
  'ACCEPTED',
  'EXPIRED',
  'SUPERSEDED',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Ready to send',
  SHARED: 'Sent',
  ACCEPTED: 'Accepted',
  EXPIRED: 'Expired',
  SUPERSEDED: 'Replaced',
};

/** Statuses whose validity clock is running. */
export const LIVE_QUOTE_STATUSES: readonly QuoteStatus[] = ['ISSUED', 'SHARED'];

/** "W-102 · Q2" */
export function quoteReference(weddingCode: string, version: number): string {
  return `${weddingCode} · Q${version}`;
}

export interface PaymentPart {
  bps: Bps;
  amount: Paise;
  label: string;
}

/** The payment plan in words: "Full payment to confirm", or "50% to confirm" + "50% before the first flight". */
export function paymentParts(total: Paise, planBps: readonly Bps[]): PaymentPart[] {
  const amounts = paymentSchedule(total, planBps);
  if (planBps.length === 1)
    return [
      { bps: planBps[0]!, amount: amounts[0]!, label: 'Full payment to confirm the booking' },
    ];
  return planBps.map((bps, i) => ({
    bps,
    amount: amounts[i]!,
    label:
      i === 0
        ? `${formatBps(bps)} advance to confirm the booking`
        : i === planBps.length - 1
          ? `${formatBps(bps)} balance before the first flight`
          : `${formatBps(bps)} instalment ${i + 1}`,
  }));
}

export interface OutwardAirport {
  iata: string;
  city: string;
  name: string;
}

export interface OutwardQuoteLine {
  aircraft: string;
  seats: number | null;
  /** The named operator (licensed carrier) and its DGCA permit number. */
  operator: string;
  operatorPermit: string | null;
  price: Paise;
}

export interface OutwardQuoteLeg {
  seq: number;
  from: OutwardAirport;
  to: OutwardAirport;
  /** Helicopter legs: the venue or helipad at each end, when it isn't the airport itself. */
  fromSite?: LegSite | null;
  toSite?: LegSite | null;
  /** Helicopter service shown to the client ("Bride/groom helicopter entry"); null for jets. */
  service?: string | null;
  date: string;
  /** "09:00" – "12:00", either may be missing. */
  windowFrom: string | null;
  windowTo: string | null;
  pax: number;
  lines: OutwardQuoteLine[];
  price: Paise;
}

export interface OutwardQuote {
  reference: string;
  version: number;
  issuedAt: string;
  validUntil: string | null;
  /** True for an unsaved preview of a draft. */
  preview: boolean;
  business: {
    brandName: string;
    legalName: string | null;
    llpin: string | null;
    gstin: string | null;
    address: string | null;
    signatoryName: string | null;
    signatoryDesignation: string | null;
    /** data: URL of the uploaded logo, or null for the wordmark. */
    logo: string | null;
  };
  /** Our own bank account for payment (never an operator's). */
  bank: {
    accountName: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    branch: string | null;
  } | null;
  client: { name: string | null };
  wedding: { code: string; city: string | null; startsOn: string | null; endsOn: string | null };
  legs: OutwardQuoteLeg[];
  extras: Array<{ description: string; price: Paise }>;
  subtotal: Paise;
  gst: {
    rateBps: Bps;
    sac: string | null;
    intraState: boolean;
    cgst: Paise;
    sgst: Paise;
    igst: Paise;
    total: Paise;
    /** FEE_ONLY: GST is charged on our service fee only. */
    feeOnly: boolean;
  };
  total: Paise;
  payment: PaymentPart[];
  cancellation: { schedule: CancellationSchedule; note: string | null };
  inclusions: string | null;
  exclusions: string | null;
}
