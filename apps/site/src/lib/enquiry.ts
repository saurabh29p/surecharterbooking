/**
 * Turning the website's enquiry form into the API's body (apps/api/src/enquiries/enquiry.dto.ts).
 * Pure functions, so they are tested without a browser.
 */
import type { Attribution } from './attribution';

export type Role = 'FAMILY' | 'PLANNER' | 'HOTEL';

/** The guest ranges from the mockup's picker; the API gets the top of the range. */
export const GUEST_RANGES = [
  { value: '6', label: 'Up to 6', guests: 6 },
  { value: '14', label: '7 to 14', guests: 14 },
  { value: '50', label: '15 to 50', guests: 50 },
  { value: '51', label: 'More than 50', guests: 51 },
] as const;

export interface EnquiryFormValues {
  name: string;
  phone: string;
  email?: string;
  role: Role;
  firm?: string;
  weddingCity?: string;
  weddingDate?: string;
  /** One of GUEST_RANGES' values, or a typed number. */
  guests?: string;
  guestsFrom?: string;
  message?: string;
  consent: boolean;
  marketingConsent?: boolean;
  /** Honeypot: people never see it. */
  companyWebsite?: string;
}

export interface EnquiryBody {
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  firm: string | null;
  weddingCity: string | null;
  weddingDate: string | null;
  guests: number | null;
  guestsFrom: string | null;
  message: string | null;
  consent: boolean;
  marketingConsent: boolean;
  companyWebsite: string | null;
  elapsedMs: number;
}

const clean = (v: string | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

export function enquiryBody(
  v: EnquiryFormValues,
  elapsedMs: number,
  attr: Attribution,
): EnquiryBody & Attribution {
  const range = GUEST_RANGES.find((r) => r.value === v.guests);
  const typed = v.guests && /^\d+$/.test(v.guests.trim()) ? Number(v.guests.trim()) : null;
  const guests = range ? range.guests : typed;
  // The API keeps one number; a range picked on the form goes into the message too.
  const rangeNote = range && range.value !== '6' ? `Guests flying: ${range.label}` : null;
  const message = [clean(v.message), rangeNote].filter(Boolean).join('\n') || null;
  const business = v.role !== 'FAMILY';
  return {
    ...attr,
    name: v.name.trim(),
    phone: v.phone.trim(),
    email: clean(v.email),
    role: v.role,
    firm: business ? clean(v.firm) : null,
    weddingCity: clean(v.weddingCity),
    weddingDate: clean(v.weddingDate),
    guests,
    guestsFrom: clean(v.guestsFrom),
    message,
    consent: v.consent,
    marketingConsent: !!v.marketingConsent,
    companyWebsite: clean(v.companyWebsite),
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
}

/** Same rule as the API's phone check (packages/shared normalizePhone). */
export function phoneOk(input: string): boolean {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15;
  const local = digits.replace(/^(?:91|0)(?=[6-9]\d{9}$)/, '');
  return /^[6-9]\d{9}$/.test(local);
}

/** Check in the browser before sending, with the API's own messages (it checks again). */
export function enquiryProblems(v: EnquiryFormValues): Record<string, string> {
  const p: Record<string, string> = {};
  if (v.name.trim().length < 2) p.name = 'Enter your name';
  if (!v.phone.trim()) p.phone = 'Enter your WhatsApp number';
  else if (!phoneOk(v.phone)) p.phone = 'Enter a 10-digit mobile number, or + and the country code';
  if (v.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()))
    p.email = 'Enter a valid email';
  if (v.weddingDate && !/^\d{4}-\d{2}-\d{2}$/.test(v.weddingDate)) p.weddingDate = 'Choose a date';
  if (v.role !== 'FAMILY' && !v.firm?.trim()) p.firm = 'Enter your firm or hotel name';
  if (!v.consent) p.consent = 'Please tick the box so we can contact you about your enquiry';
  return p;
}

/** A WhatsApp message with what the person typed, for when sending fails. */
export function whatsappFallbackText(v: EnquiryFormValues): string {
  const range = GUEST_RANGES.find((r) => r.value === v.guests);
  const lines = [
    `Hello Vaanika, I'd like to plan wedding flights.`,
    `Name: ${v.name.trim()}`,
    v.role !== 'FAMILY'
      ? `I am a ${v.role === 'PLANNER' ? 'wedding planner' : 'hotel'}${v.firm?.trim() ? ` (${v.firm.trim()})` : ''}`
      : null,
    v.weddingCity?.trim() ? `Venue or city: ${v.weddingCity.trim()}` : null,
    v.weddingDate ? `Wedding date: ${v.weddingDate}` : null,
    range ? `Guests flying: ${range.label}` : v.guests ? `Guests flying: ${v.guests}` : null,
    v.guestsFrom?.trim() ? `Flying from: ${v.guestsFrom.trim()}` : null,
    v.message?.trim() ? v.message.trim() : null,
  ];
  return lines.filter(Boolean).join('\n');
}
