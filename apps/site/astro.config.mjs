// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

/**
 * Vaanika public site: static pages only (WEBSITE.md §4).
 *
 * Launch is an explicit switch, not "whatever Vercel calls production": only a Vercel production
 * build with PUBLIC_LAUNCHED=true is the live site. Every other build is a preview: draft banners,
 * the placeholder warning and "verify" tags show, every page is `noindex` and robots.txt disallows all.
 */
const vercelEnv = process.env.VERCEL_ENV ?? 'development';
const launched = vercelEnv === 'production' && process.env.PUBLIC_LAUNCHED === 'true';
const preview = !launched;
const indexable = launched;

const bodoni = '@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz';

/** Where forms and taps go: the only other origin a page may talk to. */
const apiOrigin = new URL(process.env.PUBLIC_API_URL ?? 'http://localhost:3000').origin;

/** Google Ads is the only third party, and only when its id is set. */
const ads = !!process.env.PUBLIC_GOOGLE_ADS_ID;
/**
 * On the launched site, estimated facts written in Markdown as <span class="verify"> become plain
 * text (the "verify" tag is for previews only; WEBSITE.md §10, apps/site/VERIFY.md).
 */
const unwrapVerify = {
  name: 'vaanika:unwrap-verify',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      if (!launched) return;
      const { readdir, readFile, writeFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const root = fileURLToPath(dir);
      for (const f of await readdir(root, { recursive: true })) {
        if (!f.endsWith('.html')) continue;
        const path = `${root}/${f}`;
        const html = await readFile(path, 'utf8');
        const out = html.replace(/<span class="verify">([^<]*)<\/span>/g, '$1');
        if (out !== html) await writeFile(path, out);
      }
    },
  },
};

const adsHosts = ads
  ? ' https://www.googletagmanager.com https://www.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com'
  : '';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'https://flyvaanika.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
  devToolbar: { enabled: false },
  // No code blocks on this site; Shiki's inline styles would also break the security policy.
  markdown: { syntaxHighlight: false },
  integrations: [unwrapVerify],
  // A content security policy in a <meta> tag, with hashes for every inline script and style.
  // frame-ancestors can't go in a meta tag: vercel.json sends it as a header.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        `img-src 'self' data:${adsHosts}`,
        "font-src 'self'",
        "media-src 'self'",
        `connect-src 'self' ${apiOrigin}${adsHosts}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        ads ? 'frame-src https://td.doubleclick.net' : "frame-src 'none'",
      ],
      scriptDirective: {
        resources: ["'self'", ...(ads ? ['https://www.googletagmanager.com'] : [])],
      },
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
