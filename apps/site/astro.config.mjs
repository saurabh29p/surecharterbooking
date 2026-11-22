// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

/**
 * Vaanika public site: static pages only (WEBSITE.md §4).
 *
 * Build-time switches (Vercel sets VERCEL_ENV itself):
 * - PREVIEW: anything but Vercel production shows draft banners and the placeholder warning.
 * - INDEXABLE: only a production build with PUBLIC_ALLOW_INDEXING=true may be indexed. Until launch
 *   every page is `noindex` and robots.txt disallows everything.
 */
const vercelEnv = process.env.VERCEL_ENV ?? 'development';
const preview = vercelEnv !== 'production';
const indexable = !preview && process.env.PUBLIC_ALLOW_INDEXING === 'true';

const bodoni = '@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz';

/** Where forms and taps go: the only other origin a page may talk to. */
const apiOrigin = new URL(process.env.PUBLIC_API_URL ?? 'http://localhost:3000').origin;

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://flyvaanika.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
  devToolbar: { enabled: false },
  // A content security policy in a <meta> tag, with hashes for every inline script and style.
  // frame-ancestors can't go in a meta tag: vercel.json sends it as a header.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "media-src 'self'",
        `connect-src 'self' ${apiOrigin}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-src 'none'",
      ],
    },
  },
  // Self-hosted fonts (no Google Fonts request at runtime). Bodoni Moda keeps its optical-size axis,
  // so the large headings get the high-contrast display cut seen in the mockup.
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Bodoni Moda',
      cssVariable: '--font-display',
      fallbacks: ['Georgia', 'serif'],
      options: {
        variants: [
          { src: [`${bodoni}-normal.woff2`], weight: '400 900', style: 'normal' },
          { src: [`${bodoni}-italic.woff2`], weight: '400 900', style: 'italic' },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Manrope',
      cssVariable: '--font-body',
      fallbacks: ['system-ui', 'sans-serif'],
      options: {
        variants: [
          {
            src: ['@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2'],
            weight: '200 800',
            style: 'normal',
          },
        ],
      },
    },
  ],
  vite: {
    define: {
      __PREVIEW__: JSON.stringify(preview),
      __INDEXABLE__: JSON.stringify(indexable),
    },
  },
});
