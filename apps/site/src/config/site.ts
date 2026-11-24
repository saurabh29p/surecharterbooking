import { company } from './company';

export const SITE_URL = (import.meta.env.PUBLIC_SITE_URL ?? 'https://flyvaanika.com').replace(
  /\/$/,
  '',
);
/** The desk API (enquiries, partner sign-ups, tap events). */
export const API_URL = (import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
export const GOOGLE_ADS_ID = import.meta.env.PUBLIC_GOOGLE_ADS_ID || null;
/** Conversion labels from Google Ads, e.g. "enquiry:AbC123,whatsapp:DeF456,call:GhI789,partner:JkL012". */
export const GOOGLE_ADS_LABELS: Record<string, string> = Object.fromEntries(
  (import.meta.env.PUBLIC_GOOGLE_ADS_LABELS ?? '')
    .split(',')
    .map((pair) => pair.split(':').map((x) => x.trim()))
    .filter((kv): kv is [string, string] => kv.length === 2 && !!kv[0] && !!kv[1]),
);
/** "vercel" switches on Vercel Web Analytics and Speed Insights (cookieless). */
export const ANALYTICS = import.meta.env.PUBLIC_ANALYTICS === 'vercel';

export const PREVIEW = __PREVIEW__;
export const INDEXABLE = __INDEXABLE__;

export interface NavItem {
  label: string;
  href: string;
}

/** Header navigation (WEBSITE.md §6, the mockup's order). */
export const NAV: NavItem[] = [
  { label: 'Our standard', href: '/how-we-work/' },
  { label: 'Destinations', href: '/destinations/' },
  { label: 'Jets & helicopters', href: '/aircraft/' },
  { label: 'The Shreeji Arrival', href: '/helicopter-arrivals/' },
  { label: 'Private & business', href: '/private-charter/' },
  { label: 'For planners', href: '/for-planners/' },
];

/** Footer links beyond the header ones. */
export const MORE_LINKS: NavItem[] = [
  { label: 'Wedding flights', href: '/weddings/' },
  { label: 'FAQ', href: '/faq/' },
  { label: 'Guides', href: '/guides/' },
  { label: 'About Vaanika', href: '/about/' },
  { label: 'Contact', href: '/contact/' },
];

export const LEGAL_LINKS: NavItem[] = [
  { label: 'Privacy notice', href: '/legal/privacy/' },
  { label: 'Website terms', href: '/legal/terms/' },
  { label: 'Charter booking terms', href: '/legal/charter-terms/' },
  { label: 'Cancellation & refund', href: '/legal/cancellation-refund/' },
  { label: 'Grievance officer', href: '/legal/grievance/' },
  { label: 'Cookie notice', href: '/legal/cookies/' },
];

/** wa.me link with a pre-filled wedding enquiry that names the page. */
export function whatsappLink(pageName: string, extra?: string): string {
  const text = [
    `Hello Vaanika, I'd like to plan wedding flights. (From your ${pageName} page)`,
    extra,
  ]
    .filter(Boolean)
    .join('\n\n');
  return `https://wa.me/${company.whatsapp.digits}?text=${encodeURIComponent(text)}`;
}

export const telLink = `tel:+${company.phone.digits}`;
