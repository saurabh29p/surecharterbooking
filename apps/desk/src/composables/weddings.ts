import {
  isHelicopter,
  type AircraftCategory,
  type HeliChecks,
  type HeliService,
  type LeadSource,
  type LegSite,
  type LegStatus,
  type WeddingStatus,
} from '@shubhjets/shared';

export interface WeddingCard {
  id: string;
  code: string;
  status: WeddingStatus;
  venueCity: string | null;
  startsOn: string | null;
  endsOn: string | null;
  firstFlight: string | null;
  leadSource: LeadSource;
  lostReason: string | null;
  partner: { id: string; firm: string } | null;
  client: { id: string; name: string } | null;
  legs: number;
  /** Guests on the biggest leg. */
  pax: number;
  quoteStatus: string | null;
  value: number | null;
  margin: number | null;
}

export interface WeddingBoard {
  items: WeddingCard[];
  counts: Record<WeddingStatus, number>;
}

export interface LegRow {
  id: string;
  seq: number;
  fromIata: string;
  toIata: string;
  flightDate: string;
  windowFrom: string | null;
  windowTo: string | null;
  pax: number;
  category: AircraftCategory | null;
  status: LegStatus;
  notes: string | null;
  /** Helicopter legs only. */
  fromSite: LegSite | null;
  toSite: LegSite | null;
  serviceType: HeliService | null;
  heliChecks: HeliChecks;
}

export interface WeddingDetail {
  id: string;
  code: string;
  status: WeddingStatus;
  lostReason: string | null;
  venueCity: string | null;
  startsOn: string | null;
  endsOn: string | null;
  leadSource: LeadSource;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
  };
  landingPage: string | null;
  notes: string | null;
  requiredPaymentBps: number;
  placeOfSupplyState: string | null;
  partner: { id: string; firm: string; phone: string | null } | null;
  client: { id: string; name: string; phone: string | null; email: string | null } | null;
  businessProfile: { id: string; label: string } | null;
  manualMoves: WeddingStatus[];
  legs: LegRow[];
}

/** A venue or helipad end as typed in a form. */
export interface SiteDraft {
  on: boolean;
  name: string;
  city: string;
  mapUrl: string;
}

/** One leg as typed in a form (strings, so inputs can be empty while editing). */
export interface LegDraft {
  from: string;
  to: string;
  date: string;
  windowFrom: string;
  windowTo: string;
  pax: string;
  category: AircraftCategory | '';
  serviceType: HeliService | '';
  fromSite: SiteDraft;
  toSite: SiteDraft;
}

const noSite = (): SiteDraft => ({ on: false, name: '', city: '', mapUrl: '' });
const siteDraft = (s: LegSite | null): SiteDraft =>
  s ? { on: true, name: s.name, city: s.city ?? '', mapUrl: s.mapUrl ?? '' } : noSite();
const siteBody = (s: SiteDraft): LegSite | null =>
  s.on ? { name: s.name, city: s.city || null, mapUrl: s.mapUrl || null } : null;

export const emptyLeg = (prev?: LegDraft): LegDraft => ({
  // A return leg is the usual next step: swap the route and keep the passengers.
  from: prev?.to ?? 'DEL',
  to: prev?.from ?? '',
  date: prev?.date ?? '',
  windowFrom: '',
  windowTo: '',
  pax: prev?.pax ?? '',
  category: prev?.category ?? '',
  serviceType: prev?.serviceType ?? '',
  fromSite: prev ? { ...prev.toSite } : noSite(),
  toSite: prev ? { ...prev.fromSite } : noSite(),
});

export const legToDraft = (l: LegRow): LegDraft => ({
  from: l.fromIata,
  to: l.toIata,
  date: l.flightDate,
  windowFrom: l.windowFrom ?? '',
  windowTo: l.windowTo ?? '',
  pax: String(l.pax),
  category: l.category ?? '',
  serviceType: l.serviceType ?? '',
  fromSite: siteDraft(l.fromSite),
  toSite: siteDraft(l.toSite),
});

export const legBody = (d: LegDraft) => {
  // Venues, helipads and services only travel with a helicopter leg; switching to a jet clears them.
  const heli = !!d.category && isHelicopter(d.category);
  return {
    from: d.from,
    to: d.to,
    date: d.date,
    windowFrom: d.windowFrom,
    windowTo: d.windowTo,
    pax: d.pax === '' ? undefined : Number(d.pax),
    category: d.category || null,
    serviceType: heli ? d.serviceType || null : null,
    fromSite: heli ? siteBody(d.fromSite) : null,
    toSite: heli ? siteBody(d.toSite) : null,
  };
};

/** Statuses shown as columns on the board, in order. */
export const BOARD_COLUMNS: WeddingStatus[] = [
  'ENQUIRY',
  'RATES_REQUESTED',
  'QUOTED',
  'SIGNED_AND_PAID',
  'FLYING',
  'DONE',
  'LOST',
];
