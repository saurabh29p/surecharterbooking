/**
 * Website enquiries (BRIEF.md §5.7, WEBSITE.md §5): who is asking, where guests fly from,
 * and where the enquiry came from (lead source + UTM).
 */
import type { LeadSource } from './wedding.js';

export const ENQUIRY_ROLES = ['FAMILY', 'PLANNER', 'HOTEL'] as const;
export type EnquiryRole = (typeof ENQUIRY_ROLES)[number];

export const ENQUIRY_ROLE_LABELS: Record<EnquiryRole, string> = {
  FAMILY: 'Family',
  PLANNER: 'Wedding planner',
  HOTEL: 'Hotel wedding team',
};

/** Ways people write the cities we fly from and to. Ambiguous ones (plain "Goa") stay unmatched. */
const CITY_ALIASES: Record<string, string> = {
  delhi: 'DEL',
  'new delhi': 'DEL',
  ncr: 'DEL',
  'delhi ncr': 'DEL',
  gurgaon: 'DEL',
  gurugram: 'DEL',
  noida: 'DEL',
  mumbai: 'BOM',
  bombay: 'BOM',
  bengaluru: 'BLR',
  bangalore: 'BLR',
  hyderabad: 'HYD',
  chennai: 'MAA',
  madras: 'MAA',
  kolkata: 'CCU',
  calcutta: 'CCU',
  ahmedabad: 'AMD',
  pune: 'PNQ',
  udaipur: 'UDR',
  jaipur: 'JAI',
  jodhpur: 'JDH',
  jaisalmer: 'JSA',
  'goa dabolim': 'GOI',
  dabolim: 'GOI',
  'south goa': 'GOI',
  'goa mopa': 'GOX',
  mopa: 'GOX',
  'north goa': 'GOX',
  pantnagar: 'PGH',
  'jim corbett': 'PGH',
  corbett: 'PGH',
  dehradun: 'DED',
  mussoorie: 'DED',
  rishikesh: 'DED',
  kochi: 'COK',
  cochin: 'COK',
  chandigarh: 'IXC',
};

/** "New Delhi" / "delhi ncr" / "UDR" → IATA code we serve, or null when unknown or ambiguous. */
export function cityToIata(
  input: string | null | undefined,
  known?: readonly string[],
): string | null {
  if (!input) return null;
  const text = input
    .toLowerCase()
    .replace(/\(.*?\)/g, (m) => ` ${m.slice(1, -1)} `)
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const upper = input.trim().toUpperCase();
  const codes = known ?? Object.values(CITY_ALIASES);
  if (/^[A-Z]{3}$/.test(upper) && codes.includes(upper)) return upper;
  return CITY_ALIASES[text] ?? null;
}

export interface Attribution {
  leadSource?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  gclid?: string | null;
}

/**
 * Which channel brought a website enquiry: Google Ads (gclid or google/cpc), Instagram, or the
 * website itself. An explicit lead source from the site wins when it is one we know.
 */
export function websiteLeadSource(a: Attribution): LeadSource {
  const known: LeadSource[] = ['WEBSITE', 'GOOGLE_ADS', 'INSTAGRAM'];
  const explicit = (a.leadSource ?? '').toUpperCase() as LeadSource;
  if (known.includes(explicit)) return explicit;
  const src = (a.utmSource ?? '').toLowerCase();
  const med = (a.utmMedium ?? '').toLowerCase();
  if (a.gclid || (src.includes('google') && /cpc|ppc|paid|ads/.test(med))) return 'GOOGLE_ADS';
  if (src.includes('instagram') || src === 'ig') return 'INSTAGRAM';
  return 'WEBSITE';
}

/** "18 from Delhi, 6 from Mumbai" (WEBSITE.md: guests flying from which cities) → structured. */
export function parseGuestOrigins(
  text: string | null | undefined,
): Array<{ city: string; guests: number | null }> {
  if (!text) return [];
  return text
    .split(/[,;\n]|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m =
        /(\d{1,3})\s*(?:guests?|people|pax|log)?\s*(?:from|ex|se)?\s*([a-z][a-z .()-]*)$/i.exec(
          part,
        ) ?? /([a-z][a-z .()-]*?)\s*[:\-–]?\s*(\d{1,3})\s*(?:guests?|people|pax|log)?$/i.exec(part);
      if (!m) return { city: part, guests: null };
      const [a, b] = [m[1]!, m[2]!];
      // Hinglish: "20 log Delhi se" (20 people from Delhi).
      const clean = (c: string) => c.replace(/\s+se$/i, '').trim();
      return /^\d+$/.test(a)
        ? { city: clean(b), guests: Number(a) }
        : { city: clean(a), guests: Number(b) };
    });
}
