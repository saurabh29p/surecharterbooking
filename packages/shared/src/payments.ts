/**
 * Money for one wedding: what the client owes and has paid, what is owed to operators and the
 * partner, and the two hard rules on it:
 *  - rule 2: a wedding is confirmed only with signed client terms and the required payment in;
 *  - rule 3: operator payouts and partner commission become payable only when client money
 *    received covers them (and commission only once the wedding has flown).
 */
import { addDays, type IsoDate } from './dates.js';
import { formatINR, type Bps, type Paise } from './money.js';
import { checkPayoutCovered, requiredPayment } from './pricing.js';

export type PaymentDirection = 'CLIENT_IN' | 'OPERATOR_OUT' | 'PARTNER_OUT';
export type PaymentStatus = 'RECORDED' | 'PAYABLE' | 'PAID';
export type PaymentMode = 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'CASH' | 'OTHER';

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CASH: 'Cash',
  OTHER: 'Other',
};

export const PAYMENT_DIRECTION_LABELS: Record<PaymentDirection, string> = {
  CLIENT_IN: 'Client payment',
  OPERATOR_OUT: 'Operator payout',
  PARTNER_OUT: 'Partner commission',
};

export interface PaymentLike {
  direction: PaymentDirection;
  /** Client payment: amount received. Operator: net payout. Partner: gross commission. */
  amount: Paise;
  /** Operator payouts: GST on the operator's invoice, paid on top of the net. */
  gstAmount?: Paise;
  status: PaymentStatus;
}

/** What actually leaves your account for an outgoing payment (operator net + their GST). */
export function outflow(p: PaymentLike): Paise {
  return p.direction === 'OPERATOR_OUT' ? p.amount + (p.gstAmount ?? 0) : p.amount;
}

export interface MoneyPosition {
  /** Quote total including GST (0 without an accepted quote). */
  total: Paise;
  /** Payment needed before the wedding can be confirmed. */
  required: Paise;
  received: Paise;
  /** Still needed to confirm (0 when enough is in). */
  dueToConfirm: Paise;
  /** Still to come from the client in all. */
  balance: Paise;
  operatorCommitted: Paise;
  operatorPaid: Paise;
  partnerCommitted: Paise;
  partnerPaid: Paise;
  /** Client money not yet committed to payouts: the most that can be made payable now. */
  uncommitted: Paise;
}

export function moneyPosition(
  total: Paise,
  requiredBps: Bps,
  payments: readonly PaymentLike[],
): MoneyPosition {
  const sum = (f: (p: PaymentLike) => boolean, v: (p: PaymentLike) => Paise = outflow) =>
    payments.filter(f).reduce((s, p) => s + v(p), 0);
  const received = sum(
    (p) => p.direction === 'CLIENT_IN',
    (p) => p.amount,
  );
  const required = requiredPayment(total, requiredBps);
  const operatorCommitted = sum((p) => p.direction === 'OPERATOR_OUT');
  const partnerCommitted = sum((p) => p.direction === 'PARTNER_OUT');
  return {
    total,
    required,
    received,
    dueToConfirm: Math.max(0, required - received),
    balance: Math.max(0, total - received),
    operatorCommitted,
    operatorPaid: sum((p) => p.direction === 'OPERATOR_OUT' && p.status === 'PAID'),
    partnerCommitted,
    partnerPaid: sum((p) => p.direction === 'PARTNER_OUT' && p.status === 'PAID'),
    uncommitted: received - operatorCommitted - partnerCommitted,
  };
}

/**
 * Rule 3: can this outgoing payment be made payable (or recorded as paid)?
 * Returns a plain reason when not, or null when it is covered.
 */
export function payoutBlocker(
  pos: MoneyPosition,
  proposed: Paise,
  opts: { partner?: boolean; flown?: boolean } = {},
): string | null {
  if (opts.partner && !opts.flown)
    return 'Commission is earned only after the client has paid and the wedding has flown';
  const check = checkPayoutCovered(
    pos.received,
    pos.operatorCommitted + pos.partnerCommitted,
    proposed,
  );
  if (check.allowed) return null;
  return `Client money received covers ${formatINR(Math.max(0, pos.uncommitted), { paise: 'never' })} more in payouts; ${formatINR(check.shortfall, { paise: 'never' })} more must come in from the client first`;
}

export interface ConfirmationInput {
  hasAcceptedQuote: boolean;
  termsSigned: boolean;
  position: MoneyPosition;
}

export interface ConfirmationItem {
  key: 'quote' | 'terms' | 'payment';
  label: string;
  done: boolean;
  hint: string | null;
}

/** Rule 2: everything needed before a wedding can be marked signed and paid. */
export function confirmationChecklist(input: ConfirmationInput): ConfirmationItem[] {
  const p = input.position;
  return [
    {
      key: 'quote',
      label: 'Client accepted a quote',
      done: input.hasAcceptedQuote,
      hint: input.hasAcceptedQuote ? null : 'Record the acceptance on the Quote tab',
    },
    {
      key: 'terms',
      label: 'Client terms signed',
      done: input.termsSigned,
      hint: input.termsSigned ? null : 'Upload the signed client terms on the Docs tab',
    },
    {
      key: 'payment',
      label: `Payment received (${formatINR(p.required, { paise: 'never' })} needed)`,
      done: input.hasAcceptedQuote && p.dueToConfirm === 0,
      hint:
        input.hasAcceptedQuote && p.dueToConfirm > 0
          ? `${formatINR(p.dueToConfirm, { paise: 'never' })} more to receive`
          : null,
    },
  ];
}

/** The day guest ID files are deleted: N days after the wedding's last flight. */
export function idDeletionDate(lastFlightDate: IsoDate, retentionDays: number): IsoDate {
  return addDays(lastFlightDate, retentionDays);
}

/** "Name, +91 98…" lines pasted from WhatsApp → guests (blank lines and numbering ignored). */
export function parseGuestLines(text: string): Array<{ name: string; phone: string | null }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(.*?)[,;\t ]+(\+?\d[\d\s-]{7,})$/.exec(l);
      return m
        ? { name: m[1]!.trim(), phone: m[2]!.replace(/[\s-]/g, '') }
        : { name: l, phone: null };
    })
    .filter((g) => g.name.length > 0);
}
