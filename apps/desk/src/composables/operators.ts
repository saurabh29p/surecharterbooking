import type {
  AircraftCategory,
  ChecklistItem,
  Expiry,
  OperatorDocKind,
  OperatorStatus,
} from '@shubhjets/shared';
import { CATEGORY_LABELS, formatDate } from '@shubhjets/shared';

export interface OperatorListItem {
  id: string;
  legalName: string;
  brand: string | null;
  status: OperatorStatus;
  statusReason: string | null;
  bases: string[];
  fleet: Partial<Record<AircraftCategory, number>>;
  maxSeats: number | null;
  nearestExpiry: Expiry | null;
  weddingsDone: number;
  avgReplyHours: number | null;
  dgcaRank: number | null;
}

export interface OperatorDocument {
  id: string;
  kind: OperatorDocKind;
  fileId: string | null;
  expiresOn: string | null;
  verifiedOn: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AircraftRow {
  id: string;
  type: string;
  registration: string | null;
  category: AircraftCategory;
  seats: number;
  year: number | null;
  baseAirport: string | null;
}

export interface ContactRow {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface OperatorDetail {
  id: string;
  legalName: string;
  brand: string | null;
  cin: string | null;
  gstin: string | null;
  address: string | null;
  nsopNo: string | null;
  nsopIssuedOn: string | null;
  website: string | null;
  safetyDisclosureUrl: string | null;
  sourceLink: string | null;
  dgcaRank: number | null;
  dgcaRankCheckedOn: string | null;
  dgcaRankSource: string | null;
  cancellationTerms: string | null;
  notes: string | null;
  status: OperatorStatus;
  statusReason: string | null;
  blockKind: 'MANUAL' | 'EXPIRED' | null;
  blockedReason: string | null;
  verifiedAt: string | null;
  hasBankDetails: boolean;
  bankHint: string | null;
  bases: string[];
  contacts: ContactRow[];
  aircraft: AircraftRow[];
  documents: OperatorDocument[];
  checklist: ChecklistItem[];
  readyToVerify: boolean;
  expiries: Expiry[];
  quotable: { ok: boolean; reason: string | null };
  weddingsDone: number;
  avgReplyHours: number | null;
}

/** "2 Midsize jet · 1 Heavy jet" */
export function fleetSummary(fleet: Partial<Record<AircraftCategory, number>>): string {
  const parts = (Object.entries(fleet) as [AircraftCategory, number][]).map(
    ([c, n]) => `${n} ${CATEGORY_LABELS[c].toLowerCase()}`,
  );
  return parts.length ? parts.join(' · ') : 'No aircraft added';
}

/** "Insurance expires in 9 days (26 Nov 2026)" / "expired 3 days ago". */
export function expiryText(e: Expiry): string {
  const what = e.kind === 'NSOP' ? 'NSOP permit' : 'Insurance';
  if (e.daysLeft < 0)
    return `${what} expired ${-e.daysLeft} day${e.daysLeft === -1 ? '' : 's'} ago (${formatDate(e.expiresOn)})`;
  if (e.daysLeft === 0) return `${what} expires today`;
  return `${what} expires in ${e.daysLeft} day${e.daysLeft === 1 ? '' : 's'} (${formatDate(e.expiresOn)})`;
}
