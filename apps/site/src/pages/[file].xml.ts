/**
 * sitemap.xml, built only for the launched site (WEBSITE.md §9): previews have no sitemap at all.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { INDEXABLE, SITE_URL } from '../config/site';
import { visibleGuides } from '../lib/content';

export function getStaticPaths() {
  return INDEXABLE ? [{ params: { file: 'sitemap' } }] : [];
}

const STATIC = [
  '/',
  '/weddings/',
  '/helicopter-arrivals/',
  '/destinations/',
  '/aircraft/',
  '/how-we-work/',
  '/for-planners/',
  '/private-charter/',
  '/faq/',
  '/about/',
  '/contact/',
  '/guides/',
];

export const GET: APIRoute = async () => {
  const destinations = (await getCollection('destinations')).map((d) => `/destinations/${d.id}/`);
  const guides = (await visibleGuides()).map((g) => ({
    path: `/guides/${g.id}/`,
    lastmod: (g.data.updated ?? g.data.published).toISOString().slice(0, 10),
  }));
  const legal = (await getCollection('legal')).map((l) => ({
    path: `/legal/${l.id}/`,
    lastmod: l.data.updated.toISOString().slice(0, 10),
  }));
  const entries = [
    ...[...STATIC, ...destinations].map((path) => ({
      path,
      lastmod: undefined as string | undefined,
    })),
    ...guides,
    ...legal,
  ];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      (e) =>
        `  <url><loc>${SITE_URL}${e.path}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
