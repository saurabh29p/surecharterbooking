import {
  formatBps,
  type ActivityKind,
  type CommissionBasis,
  type ConsentSource,
  type PartnerStatus,
  type PartnerType,
} from '@shubhjets/shared';

export interface PartnerStats {
  weddingsThisSeason: number;
  bookingsValue: number;
  commissionEarned: number;
  commissionPaid: number;
  commissionOwed: number;
}

export interface PartnerBase {
  id: string;
  type: PartnerType;
  firm: string;
  city: string | null;
  address: string | null;
  gstin: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  sourceLink: string | null;
  fitNote: string | null;
  notes: string | null;
  status: PartnerStatus;
  commissionBasis: CommissionBasis;
  commissionBps: number;
  referralSigned: boolean;
  referralFileId: string | null;
  nextFollowUpOn: string | null;
  followUpDue: boolean;
  stats: PartnerStats;
}

export interface PartnerListItem extends PartnerBase {
  lastActivity: { kind: ActivityKind; at: string } | null;
}

export interface PartnerList {
  items: PartnerListItem[];
  counts: Record<PartnerStatus, number>;
  followUpsDue: number;
}

export interface ConsentRecord {
  id: string;
  source: ConsentSource;
  givenAt: string;
  noticeVersion: string;
  withdrawnAt: string | null;
}

export interface PartnerDetail extends PartnerBase {
  activities: { id: string; kind: ActivityKind; note: string | null; at: string }[];
  clients: { id: string; name: string; phone: string | null }[];
  weddings: {
    id: string;
    code: string;
    status: string;
    venue_city: string | null;
    starts_on: string | null;
  }[];
  duplicates: { id: string; firm: string; matchedOn: string[] }[];
  consents: ConsentRecord[];
}

export interface ActivityResult {
  activityId: string;
  status: PartnerStatus;
  nextFollowUpOn: string | null;
  undo: { status: PartnerStatus; nextFollowUpOn: string | null };
}

/** "20% of margin" / "2% of booking value" */
export function commissionText(basis: CommissionBasis, bps: number): string {
  return `${formatBps(bps)} of ${basis === 'MARGIN_SHARE' ? 'margin' : 'booking value'}`;
}

export const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;
