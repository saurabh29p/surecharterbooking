/**
 * Everything about the business, in one place (WEBSITE.md §4). Every page reads from here.
 * Values in [SQUARE BRACKETS] or with XXXX are placeholders listed in apps/site/PLACEHOLDERS.md;
 * preview builds show a warning banner while any remain.
 */

const env = import.meta.env;

/** Digits only, with country code, e.g. 919812345678. */
const whatsappDigits = (env.PUBLIC_WHATSAPP_NUMBER ?? '91XXXXXXXXXX').replace(/[^\dX]/g, '');
const phoneDigits = (env.PUBLIC_PHONE ?? '91XXXXXXXXXX').replace(/[^\dX]/g, '');

/** "+91 98123 45678" from "919812345678". */
function displayIndian(digits: string): string {
  const local = digits.startsWith('91') ? digits.slice(2) : digits;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}

export const company = {
  brand: 'Vaanika',
  tagline: 'Private aviation',
  legalName: 'Indicgems Exim LLP',
  brandLine: 'Vaanika is a brand of Indicgems Exim LLP.',
  /** One consistent description everywhere (site, Business Profile, social profiles). */
  description:
    'Vaanika, a brand of Indicgems Exim LLP, arranges private jets and helicopters for Indian destination weddings and private charters, as the client’s agent, with DGCA-approved NSOP operators.',
  llpin: '[LLPIN]',
  gstin: '[DELHI GSTIN]',
  address: {
    street: '[Registered address]',
    city: 'New Delhi',
    region: 'Delhi',
    postalCode: '[PIN]',
    country: 'IN',
  },
  whatsapp: {
    digits: whatsappDigits,
    display: displayIndian(whatsappDigits),
  },
  phone: {
    digits: phoneDigits,
    display: displayIndian(phoneDigits),
  },
  email: {
    hello: 'hello@flyvaanika.com',
    grievance: 'grievance@flyvaanika.com',
  },
  grievanceOfficer: {
    name: '[GRIEVANCE OFFICER NAME]',
    designation: '[DESIGNATION]',
  },
  founder: {
    name: '[FOUNDER NAME]',
    role: '[FOUNDER DESIGNATION]',
    note: '[FOUNDER NOTE — three lines in your own words]',
  },
  /** Placeholder until confirmed (WEBSITE.md §5). */
  replyTime: 'within 1 hour, 9 am – 9 pm IST',
  /** How long a written quote stays valid (placeholder from the mockup). */
  quoteValidity: '[48] hours',
  /** Social profiles: null until they exist (links are hidden while null). */
  social: {
    instagram: null as string | null,
    linkedin: null as string | null,
    youtube: null as string | null,
    googleBusiness: null as string | null,
  },
} as const;

/** WEBSITE.md §7: exact wording, do not edit without the owner. */
export const AGENT_LINE =
  'Vaanika arranges charters as an agent. Every flight is operated by a DGCA-approved NSOP operator named in your quote.';

/** WEBSITE.md §7: exact wording. */
export const PAYMENT_SAFETY =
  'We only accept payments to Indicgems Exim LLP’s current account, and we never change bank details by message. Our bank details appear only inside your official quote. If anyone asks you to pay a personal account, call us first.';

/** WEBSITE.md §7: standard card 04 text, exact. */
export const HELI_PERMISSIONS_LINE =
  'For helicopters: the operator’s landing request, the venue owner’s NOC and the district’s nod — all in place before you pay in full.';

/** A value still waiting for the owner. */
export const isPlaceholder = (v: string | null | undefined): boolean =>
  !!v && (/\[[^\]]+\]/.test(v) || /X{4,}/.test(v));

/** Every placeholder still in this file, for the preview banner. */
export function remainingPlaceholders(): string[] {
  const checks: Array<[string, string]> = [
    ['LLPIN', company.llpin],
    ['Delhi GSTIN', company.gstin],
    ['Registered address', company.address.street],
    ['PIN code', company.address.postalCode],
    ['WhatsApp number', company.whatsapp.digits],
    ['Call number', company.phone.digits],
    ['Grievance officer', company.grievanceOfficer.name],
    ['Founder', company.founder.name],
    ['Quote validity', company.quoteValidity],
  ];
  return checks.filter(([, v]) => isPlaceholder(v)).map(([k]) => k);
}
