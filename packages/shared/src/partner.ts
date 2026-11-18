/** Partner pipeline rules (BRIEF.md §4): planners and hotel wedding teams who refer weddings. */
import { financialYear, type IsoDate } from './dates.js';

export type PartnerType = 'PLANNER' | 'HOTEL' | 'OTHER';
export type PartnerStatus = 'IMPORTED' | 'CONTACTED' | 'CALL_DONE' | 'ACTIVE' | 'INACTIVE';
export type ActivityKind = 'CALLED' | 'NO_ANSWER' | 'SENT_DECK' | 'CALL_BOOKED' | 'MET' | 'NOTE';

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  PLANNER: 'Wedding planner',
  HOTEL: 'Hotel wedding team',
  OTHER: 'Other',
};

export const PARTNER_STATUSES: readonly PartnerStatus[] = [
  'IMPORTED',
  'CONTACTED',
  'CALL_DONE',
  'ACTIVE',
  'INACTIVE',
];
export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  IMPORTED: 'New lead',
  CONTACTED: 'Contacted',
  CALL_DONE: 'Call done',
  ACTIVE: 'Active partner',
  INACTIVE: 'Inactive',
};

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  CALLED: 'Called',
  NO_ANSWER: 'No answer',
  SENT_DECK: 'Sent deck',
  CALL_BOOKED: 'Call booked',
  MET: 'Met',
  NOTE: 'Note',
};

/** Pipeline order; ACTIVE and INACTIVE are only ever set by you. */
const RANK: Record<PartnerStatus, number> = {
  IMPORTED: 0,
  CONTACTED: 1,
  CALL_DONE: 2,
  ACTIVE: 3,
  INACTIVE: 3,
};

/**
 * Where an activity moves a partner: forward only, never past CALL_DONE, never backwards.
 * Returns null when the status should stay as it is.
 */
export function statusAfterActivity(
  current: PartnerStatus,
  kind: ActivityKind,
): PartnerStatus | null {
  const target: PartnerStatus | null =
    kind === 'NO_ANSWER' || kind === 'SENT_DECK' || kind === 'CALL_BOOKED'
      ? 'CONTACTED'
      : kind === 'CALLED' || kind === 'MET'
        ? 'CALL_DONE'
        : null;
  if (!target) return null;
  return RANK[target] > RANK[current] ? target : null;
}

/** "This season" = the Indian financial year (1 April – 31 March), which holds the Nov–Mar wedding peak. */
export function seasonRange(today: IsoDate): { label: string; from: IsoDate; to: IsoDate } {
  const label = financialYear(today);
  const start = Number(label.slice(0, 4));
  return { label, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** "https://www.Planner-P1.example.test/about" → "planner-p1.example.test", for duplicate checks. */
export function websiteDomain(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
    return u.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}
