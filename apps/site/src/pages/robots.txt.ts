/**
 * robots.txt (WEBSITE.md §9). Until launch: disallow everything. After launch: allow all, name the
 * search and answer-engine crawlers explicitly, and point to the sitemap.
 */
import type { APIRoute } from 'astro';
import { INDEXABLE, SITE_URL } from '../config/site';

export const GET: APIRoute = () => {
  const body = INDEXABLE
    ? [
        'User-agent: *',
        'Allow: /',
        '',
        'User-agent: Googlebot',
        'Allow: /',
        '',
        'User-agent: Bingbot',
        'Allow: /',
        '',
        'User-agent: OAI-SearchBot',
        'Allow: /',
        '',
        'User-agent: PerplexityBot',
        'Allow: /',
        '',
        `Sitemap: ${SITE_URL}/sitemap.xml`,
        '',
      ].join('\n')
    : ['# Preview: nothing is indexed until launch.', 'User-agent: *', 'Disallow: /', ''].join(
        '\n',
      );
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
