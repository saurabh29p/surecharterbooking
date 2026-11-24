/** Structured data (WEBSITE.md §9). Placeholder values are left out rather than published. */
import { company, isPlaceholder } from '../config/company';
import { SITE_URL } from '../config/site';

const real = (v: string | null | undefined) => (v && !isPlaceholder(v) ? v : undefined);

export function organizationJsonLd(): object[] {
  const a = company.address;
  const address = {
    '@type': 'PostalAddress',
    streetAddress: real(a.street),
    addressLocality: a.city,
    addressRegion: a.region,
    postalCode: real(a.postalCode),
    addressCountry: a.country,
  };
  const sameAs = Object.values(company.social).filter((v): v is string => !!v);
  const phone = real(company.phone.digits) ? `+${company.phone.digits}` : undefined;
  const orgId = `${SITE_URL}/#organization`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': orgId,
      name: company.legalName,
      legalName: company.legalName,
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512.png`,
      address,
      email: company.email.hello,
      telephone: phone,
      taxID: real(company.gstin),
      sameAs: sameAs.length ? sameAs : undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'TravelAgency',
      '@id': `${SITE_URL}/#vaanika`,
      name: company.brand,
      description: company.description,
      url: SITE_URL,
      image: `${SITE_URL}/og/vaanika.jpg`,
      logo: `${SITE_URL}/icons/icon-512.png`,
      parentOrganization: { '@id': orgId },
      address,
      telephone: phone,
      email: company.email.hello,
      areaServed: { '@type': 'Country', name: 'India' },
      sameAs: sameAs.length ? sameAs : undefined,
    },
  ];
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

/** Plain text from a FAQ answer's Markdown (links, HTML and comments removed). */
export function plainText(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** FAQPage markup (for meaning; Google no longer shows FAQ rich results). */
export function faqJsonLd(items: Array<{ question: string; answer: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: plainText(i.answer) },
    })),
  };
}

/** A service page (weddings, helicopter arrivals, private charter). */
export function serviceJsonLd(s: { name: string; description: string; path: string }): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s.name,
    description: s.description,
    url: `${SITE_URL}${s.path}`,
    serviceType: 'Private charter arrangement (agent)',
    areaServed: { '@type': 'Country', name: 'India' },
    provider: { '@id': `${SITE_URL}/#vaanika` },
  };
}
