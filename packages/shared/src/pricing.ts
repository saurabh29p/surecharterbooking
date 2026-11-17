/**
 * Quote maths: markup, margin, GST and partner commission.
 * Pure functions on integer paise and basis points; no I/O. The API, the desk and the
 * PDF layer all call these so the numbers can never disagree.
 */
import {
  type Bps,
  type Paise,
  MoneyError,
  allocateProportionally,
  applyBps,
  assertBps,
  assertPaise,
  mulDivRound,
  ratioBps,
  sumPaise,
} from './money.js';

export type MarkupType = 'PERCENT' | 'FIXED';
export type InvoicingModel = 'FULL_VALUE' | 'FEE_ONLY';
export type CommissionBasis = 'MARGIN_SHARE' | 'BOOKING_PERCENT';

/** A leg (cost + markup) or an extra (cost + explicit sell). */
export type QuoteLineInput =
  | { cost: Paise; markupType: 'PERCENT'; markupBps: Bps }
  | { cost: Paise; markupType: 'FIXED'; markupAmount: Paise }
  | { cost: Paise; sell: Paise };

export interface PricedLine {
  cost: Paise;
  sell: Paise;
  margin: Paise;
}

export function priceLine(input: QuoteLineInput): PricedLine {
  assertPaise(input.cost, 'cost');
  if (input.cost < 0) throw new MoneyError('Cost cannot be negative');
  let sell: Paise;
  if ('sell' in input) {
    assertPaise(input.sell, 'sell');
    sell = input.sell;
  } else if (input.markupType === 'PERCENT') {
    assertBps(input.markupBps, 'markup');
    sell = input.cost + applyBps(input.cost, input.markupBps);
  } else {
    assertPaise(input.markupAmount, 'markup');
    sell = input.cost + input.markupAmount;
  }
  if (sell < 0) throw new MoneyError('Sell price cannot be negative');
  return { cost: input.cost, sell, margin: sell - input.cost };
}

export interface GstInput {
  /** Total GST rate, e.g. 1800 for 18%. A Settings value confirmed by the CA. */
  rateBps: Bps;
  model: InvoicingModel;
  /** Supplier's state (from the business profile), e.g. "DL". */
  supplierState: string | null;
  /** Client's place of supply. Unknown → assumed same as supplier. */
  placeOfSupplyState: string | null;
}

export interface GstBreakdown {
  taxable: Paise;
  rateBps: Bps;
  intraState: boolean;
  placeOfSupplyAssumed: boolean;
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
  total: Paise;
}

/**
 * FULL_VALUE: GST on the whole sell value.
 * FEE_ONLY: GST only on our fee (margin); the operator cost is passed through.
 * Intra-state → CGST + SGST (half each); inter-state → IGST.
 */
export function computeGst(sellSubtotal: Paise, margin: Paise, input: GstInput): GstBreakdown {
  assertBps(input.rateBps, 'GST rate');
  const taxable = input.model === 'FULL_VALUE' ? Math.max(sellSubtotal, 0) : Math.max(margin, 0);
  const norm = (s: string | null) => (s ? s.trim().toUpperCase() : null);
  const supplier = norm(input.supplierState);
  const pos = norm(input.placeOfSupplyState);
  const placeOfSupplyAssumed = pos === null;
  const intraState = placeOfSupplyAssumed || supplier === null || supplier === pos;
  if (intraState) {
    const half = mulDivRound(taxable, input.rateBps, 20_000);
    return {
      taxable,
      rateBps: input.rateBps,
      intraState,
      placeOfSupplyAssumed,
      cgst: half,
      sgst: half,
      igst: 0,
      total: half * 2,
    };
  }
  const igst = applyBps(taxable, input.rateBps);
  return {
    taxable,
    rateBps: input.rateBps,
    intraState,
    placeOfSupplyAssumed,
    cgst: 0,
    sgst: 0,
    igst,
    total: igst,
  };
}

export interface CommissionInput {
  basis: CommissionBasis;
  bps: Bps;
}

/** Partner commission: a share of our margin, or a % of booking value (ex-GST). Never negative. */
export function computeCommission(
  margin: Paise,
  bookingValue: Paise,
  input: CommissionInput,
): Paise {
  assertBps(input.bps, 'commission');
  const base = input.basis === 'MARGIN_SHARE' ? margin : bookingValue;
  return Math.max(0, applyBps(base, input.bps));
}

export interface QuoteTotalsInput {
  lines: readonly QuoteLineInput[];
  gst: GstInput;
  /** Null when the wedding has no partner. */
  commission: CommissionInput | null;
}

export interface QuoteTotals {
  lines: PricedLine[];
  cost: Paise;
  sellSubtotal: Paise;
  margin: Paise;
  marginBps: Bps;
  gst: GstBreakdown;
  /** What the client pays: sell subtotal + GST. */
  total: Paise;
  commission: Paise;
  /** Our margin after the partner's commission. */
  netMargin: Paise;
}

export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  const lines = input.lines.map(priceLine);
  const cost = sumPaise(lines.map((l) => l.cost));
  const sellSubtotal = sumPaise(lines.map((l) => l.sell));
  const margin = sellSubtotal - cost;
  const gst = computeGst(sellSubtotal, margin, input.gst);
  const commission = input.commission
    ? computeCommission(margin, sellSubtotal, input.commission)
    : 0;
  return {
    lines,
    cost,
    sellSubtotal,
    margin,
    marginBps: ratioBps(margin, sellSubtotal),
    gst,
    total: sellSubtotal + gst.total,
    commission,
    netMargin: margin - commission,
  };
}

/** Amount that must be received before a wedding can be confirmed (default 100%). */
export function requiredPayment(total: Paise, requiredBps: Bps): Paise {
  assertBps(requiredBps, 'required payment');
  if (requiredBps > 10_000) throw new MoneyError('Required payment cannot exceed 100%');
  return applyBps(total, requiredBps);
}

/** Split a total into instalments (e.g. [5000, 5000] for 50/50) that add up exactly. */
export function paymentSchedule(total: Paise, partsBps: readonly Bps[]): Paise[] {
  const sum = partsBps.reduce((a, b) => a + b, 0);
  if (sum !== 10_000) throw new MoneyError('Instalments must add up to 100%');
  return allocateProportionally(total, partsBps);
}

export interface PayoutCheck {
  allowed: boolean;
  /** How much more client money is needed; 0 when allowed. */
  shortfall: Paise;
}

/**
 * Hard rule 3: operator payouts and partner commission can be marked payable only when
 * client money received covers everything already payable plus this new amount.
 */
export function checkPayoutCovered(
  clientReceived: Paise,
  alreadyPayable: Paise,
  proposed: Paise,
): PayoutCheck {
  assertPaise(clientReceived);
  assertPaise(alreadyPayable);
  assertPaise(proposed);
  const shortfall = alreadyPayable + proposed - clientReceived;
  return shortfall > 0 ? { allowed: false, shortfall } : { allowed: true, shortfall: 0 };
}
