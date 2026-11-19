/**
 * Helicopters for weddings: arrivals at the venue, bride/groom entries, flower showers and guest
 * joyrides. A helicopter leg can start or end at a venue or helipad, is priced per flying hour
 * (plus positioning and waiting), and needs its permissions in place before the wedding is confirmed.
 */
import type { IsoDate } from './dates.js';
import { divRound, type Paise } from './money.js';

export type HeliService = 'TRANSFER' | 'BRIDE_GROOM_ENTRY' | 'FLOWER_SHOWER' | 'JOYRIDE';
export const HELI_SERVICES: readonly HeliService[] = [
  'TRANSFER',
  'BRIDE_GROOM_ENTRY',
  'FLOWER_SHOWER',
  'JOYRIDE',
];
export const HELI_SERVICE_LABELS: Record<HeliService, string> = {
  TRANSFER: 'Helicopter transfer',
  BRIDE_GROOM_ENTRY: 'Bride/groom helicopter entry',
  FLOWER_SHOWER: 'Flower shower by helicopter',
  JOYRIDE: 'Guest joyrides',
};

/** A venue or helipad at one end of a helicopter leg. The leg keeps its nearest airport too. */
export interface LegSite {
  name: string;
  city: string | null;
  /** Google Maps (or similar) link to the landing spot. */
  mapUrl: string | null;
}

/** "Taj Lake Palace helipad, Udaipur" */
export function siteLabel(site: LegSite): string {
  return site.city && !site.name.toLowerCase().includes(site.city.toLowerCase())
    ? `${site.name}, ${site.city}`
    : site.name;
}

// ---------- Permissions ----------

export type HeliCheckKey = 'landingSite' | 'localPermission' | 'flowerShower' | 'weatherBackup';
export interface HeliCheck {
  done: boolean;
  note?: string | null;
  /** ISO time it was ticked. */
  at?: string | null;
}
export type HeliChecks = Partial<Record<HeliCheckKey, HeliCheck>>;

export const HELI_CHECK_LABELS: Record<HeliCheckKey, string> = {
  landingSite: 'Landing site confirmed with the operator (size, surface, obstacles)',
  localPermission: 'Local permission in hand (district administration / police / venue)',
  flowerShower: 'Flower-shower approval (low flying and dropping petals)',
  weatherBackup: 'Weather backup plan agreed (time window, road fallback)',
};

export interface HeliChecklistItem {
  key: HeliCheckKey;
  label: string;
  done: boolean;
  note: string | null;
}

/** What a helicopter leg needs before the wedding can be confirmed; flower-shower approval only for a flower shower. */
export function heliChecklist(
  service: HeliService | null,
  checks: HeliChecks,
): HeliChecklistItem[] {
  const keys: HeliCheckKey[] = ['landingSite', 'localPermission'];
  if (service === 'FLOWER_SHOWER') keys.push('flowerShower');
  keys.push('weatherBackup');
  return keys.map((key) => ({
    key,
    label: HELI_CHECK_LABELS[key],
    done: !!checks[key]?.done,
    note: checks[key]?.note ?? null,
  }));
}

export function heliChecksMissing(service: HeliService | null, checks: HeliChecks): string[] {
  return heliChecklist(service, checks)
    .filter((i) => !i.done)
    .map((i) => i.label.split(' (')[0]!);
}

// ---------- Pricing ----------

/** How a helicopter operator prices: per flying hour, plus getting there and waiting. All paise, ex-GST. */
export interface HourlyPricing {
  hourlyRate: Paise;
  flyingMinutes: number;
  /** Ferrying the helicopter to the start and back to base. */
  positioning: Paise;
  /** Waiting / standby charges on the ground (e.g. during the ceremony). */
  waiting: Paise;
}

/** The operator's net for the whole service: rate × flying time + positioning + waiting. */
export function hourlyNet(p: HourlyPricing): Paise {
  const flying = divRound(p.hourlyRate * p.flyingMinutes, 60);
  return flying + p.positioning + p.waiting;
}

export function pricingProblem(p: HourlyPricing): string | null {
  if (p.hourlyRate <= 0) return 'Enter the rate per flying hour';
  if (p.flyingMinutes <= 0) return 'Enter the flying time';
  if (p.flyingMinutes > 24 * 60) return 'Flying time looks too long';
  if (p.positioning < 0 || p.waiting < 0) return 'Charges cannot be negative';
  return null;
}

/** "1 h 30 min" */
export function flyingTimeText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
}

/** Amounts that must never appear on anything a client or partner sees (rule 4). */
export function hourlyInternalAmounts(p: HourlyPricing): Paise[] {
  return [p.hourlyRate, p.positioning, p.waiting, hourlyNet(p)].filter((v) => v > 0);
}

// ---------- Today ----------

export interface HeliPermissionFact {
  weddingId: string;
  code: string;
  legId: string;
  seq: number;
  flightDate: IsoDate;
  service: HeliService | null;
  missing: string[];
}
