/**
 * Operator verification (BRIEF.md hard rules 1 and 8).
 * An operator can be chosen for a leg or a quote only when you have verified it AND its NSOP permit
 * and insurance are both verified by you and not expired AND it is not blocked.
 * Within 30 days of an expiry it is EXPIRING_SOON (still usable); on expiry it is blocked automatically.
 */
import { daysBetween, formatDate, type IsoDate } from './dates.js';

export type OperatorStatus = 'FOUND' | 'VERIFIED' | 'EXPIRING_SOON' | 'BLOCKED';
export type OperatorDocKind = 'NSOP' | 'INSURANCE' | 'OPERATOR_AGREEMENT';
export type BlockKind = 'MANUAL' | 'EXPIRED';
export type AircraftCategory = 'TURBOPROP' | 'LIGHT' | 'MIDSIZE' | 'SUPER_MIDSIZE' | 'HEAVY';

export const EXPIRY_WARNING_DAYS = 30;
/** The daily job alerts once at each of these (days before expiry). */
export const EXPIRY_ALERT_DAYS = [30, 7] as const;

export const OPERATOR_STATUS_LABELS: Record<OperatorStatus, string> = {
  FOUND: 'Not verified',
  VERIFIED: 'Verified',
  EXPIRING_SOON: 'Expiring soon',
  BLOCKED: 'Blocked',
};

export const DOC_KIND_LABELS: Record<OperatorDocKind, string> = {
  NSOP: 'NSOP permit',
  INSURANCE: 'Insurance certificate',
  OPERATOR_AGREEMENT: 'Signed operator agreement',
};

export const CATEGORY_LABELS: Record<AircraftCategory, string> = {
  TURBOPROP: 'Turboprop',
  LIGHT: 'Light jet',
  MIDSIZE: 'Midsize jet',
  SUPER_MIDSIZE: 'Super-midsize jet',
  HEAVY: 'Heavy jet',
};
export const AIRCRAFT_CATEGORIES = Object.keys(CATEGORY_LABELS) as AircraftCategory[];

export interface VerificationDoc {
  kind: OperatorDocKind;
  expiresOn: IsoDate | null;
  verifiedOn: IsoDate | null;
}

export interface VerificationInput {
  nsopNo: string | null;
  safetyDisclosureUrl: string | null;
  docs: readonly VerificationDoc[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** Required items must all be done before the operator can be verified or quoted. */
  required: boolean;
  /** What to do when not done. */
  hint?: string;
}

export interface Expiry {
  kind: 'NSOP' | 'INSURANCE';
  expiresOn: IsoDate;
  /** Days from today; negative when already expired. */
  daysLeft: number;
}

/** The latest document of a kind that you have verified (newest expiry wins). */
export function currentVerifiedDoc(
  docs: readonly VerificationDoc[],
  kind: OperatorDocKind,
): VerificationDoc | null {
  const verified = docs.filter((d) => d.kind === kind && d.verifiedOn);
  verified.sort((a, b) => (b.expiresOn ?? '').localeCompare(a.expiresOn ?? ''));
  return verified[0] ?? null;
}

/** NSOP and insurance expiries from the verified documents, soonest first. */
export function operatorExpiries(input: VerificationInput, today: IsoDate): Expiry[] {
  const out: Expiry[] = [];
  for (const kind of ['NSOP', 'INSURANCE'] as const) {
    const doc = currentVerifiedDoc(input.docs, kind);
    if (doc?.expiresOn)
      out.push({ kind, expiresOn: doc.expiresOn, daysLeft: daysBetween(today, doc.expiresOn) });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function operatorChecklist(input: VerificationInput, today: IsoDate): ChecklistItem[] {
  const item = (kind: 'NSOP' | 'INSURANCE'): ChecklistItem[] => {
    const label = DOC_KIND_LABELS[kind];
    const doc = currentVerifiedDoc(input.docs, kind);
    const uploaded = input.docs.some((d) => d.kind === kind);
    const expired = !!doc?.expiresOn && daysBetween(today, doc.expiresOn) < 0;
    return [
      {
        key: `${kind.toLowerCase()}_verified`,
        label: `${label} checked and verified by you`,
        done: !!doc,
        required: true,
        hint: uploaded
          ? 'Open the uploaded document, check it, then tap Verify'
          : `Upload the ${label.toLowerCase()} with its expiry date`,
      },
      {
        key: `${kind.toLowerCase()}_valid`,
        label: `${label} not expired`,
        done: !!doc?.expiresOn && !expired,
        required: true,
        hint: !doc
          ? 'Verify the document first'
          : !doc.expiresOn
            ? 'Add the expiry date'
            : `Expired on ${formatDate(doc.expiresOn)}: upload the renewed one`,
      },
    ];
  };
  return [
    {
      key: 'nsop_number',
      label: 'NSOP permit number recorded',
      done: !!input.nsopNo?.trim(),
      required: true,
      hint: 'Add the permit number',
    },
    ...item('NSOP'),
    ...item('INSURANCE'),
    {
      key: 'safety_disclosure',
      label: 'Safety disclosure page recorded (aircraft age, maintenance, pilot experience)',
      done: !!input.safetyDisclosureUrl?.trim(),
      required: false,
      hint: "Add the link to the operator's DGCA safety disclosure page",
    },
  ];
}

export interface StatusInput extends VerificationInput {
  /** You pressed "Mark as verified" (and did not undo it). */
  verifiedByOwner: boolean;
  blockKind: BlockKind | null;
}

export interface StatusResult {
  status: OperatorStatus;
  blockKind: BlockKind | null;
  /** Plain explanation, e.g. "Insurance expired on 12 Dec 2026". */
  reason: string | null;
}

/** The single source of truth for an operator's status. */
export function deriveOperatorStatus(input: StatusInput, today: IsoDate): StatusResult {
  if (input.blockKind === 'MANUAL')
    return { status: 'BLOCKED', blockKind: 'MANUAL', reason: 'Blocked by you' };
  if (!input.verifiedByOwner)
    return { status: 'FOUND', blockKind: null, reason: 'Not verified yet' };
  const expired = operatorExpiries(input, today).find((e) => e.daysLeft < 0);
  if (expired) {
    return {
      status: 'BLOCKED',
      blockKind: 'EXPIRED',
      reason: `${DOC_KIND_LABELS[expired.kind]} expired on ${formatDate(expired.expiresOn)}`,
    };
  }
  const missing = operatorChecklist(input, today).find((c) => c.required && !c.done);
  if (missing)
    return {
      status: 'FOUND',
      blockKind: null,
      reason: `Not ready: ${missing.label.toLowerCase()}`,
    };
  const soonest = operatorExpiries(input, today)[0];
  if (soonest && soonest.daysLeft <= EXPIRY_WARNING_DAYS) {
    return {
      status: 'EXPIRING_SOON',
      blockKind: null,
      reason: `${DOC_KIND_LABELS[soonest.kind]} expires in ${soonest.daysLeft} day${soonest.daysLeft === 1 ? '' : 's'}`,
    };
  }
  return { status: 'VERIFIED', blockKind: null, reason: null };
}

/** Hard rule 1: may this operator be chosen for a leg or a quote? */
export function quotability(
  input: StatusInput,
  today: IsoDate,
): { ok: boolean; reason: string | null } {
  const { status, reason } = deriveOperatorStatus(input, today);
  return status === 'VERIFIED' || status === 'EXPIRING_SOON'
    ? { ok: true, reason: null }
    : { ok: false, reason: reason ?? OPERATOR_STATUS_LABELS[status] };
}
