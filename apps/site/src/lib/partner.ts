/**
 * The planner and hotel sign-up form → POST /api/public/partners
 * (apps/api/src/enquiries/enquiry.dto.ts, PartnerSignupBody).
 */
import type { Attribution } from './attribution';
import { phoneOk } from './enquiry';

export interface PartnerFormValues {
  name: string;
  firm: string;
  role: 'PLANNER' | 'HOTEL';
  city?: string;
  phone: string;
  email?: string;
  instagram?: string;
  weddingsPerYear?: string;
  message?: string;
  consent: boolean;
  marketingConsent?: boolean;
  companyWebsite?: string;
}

const clean = (v: string | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

export function partnerBody(v: PartnerFormValues, elapsedMs: number, attr: Attribution) {
  const n = v.weddingsPerYear?.trim();
  return {
    ...attr,
    name: v.name.trim(),
    firm: v.firm.trim(),
    role: v.role,
    city: clean(v.city),
    phone: v.phone.trim(),
    email: clean(v.email),
    instagram: clean(v.instagram),
    weddingsPerYear: n && /^\d+$/.test(n) ? Number(n) : null,
    message: clean(v.message),
    consent: v.consent,
    marketingConsent: !!v.marketingConsent,
    companyWebsite: clean(v.companyWebsite),
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
}

/** The API's own checks and words. */
export function partnerProblems(v: PartnerFormValues): Record<string, string> {
  const p: Record<string, string> = {};
  if (v.name.trim().length < 2) p.name = 'Enter your name';
  if (v.firm.trim().length < 2) p.firm = 'Enter your firm or hotel name';
  if (!v.phone.trim()) p.phone = 'Enter your WhatsApp number';
  else if (!phoneOk(v.phone)) p.phone = 'Enter a 10-digit mobile number, or + and the country code';
  if (v.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()))
    p.email = 'Enter a valid email';
  const n = v.weddingsPerYear?.trim();
  if (n && (!/^\d+$/.test(n) || Number(n) > 1000)) p.weddingsPerYear = 'Enter a number, e.g. 12';
  if (!v.consent) p.consent = 'Please tick the box so we can contact you about your enquiry';
  return p;
}
