import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright-core';

const require = createRequire(import.meta.url);

export interface RenderOptions {
  /** Small grey line at the foot of every page (e.g. legal name and registration numbers). */
  footer?: string;
}

/** Brand fonts embedded in every document, so PDFs look the same on any server. */
function fontFaces(): string {
  const face = (family: string, pkg: string, file: string, weight: number, style: string) => {
    const latin = readFileSync(
      require.resolve(`${pkg}/files/${file}-latin-${weight}-${style}.woff2`),
    );
    const ext = readFileSync(
      require.resolve(`${pkg}/files/${file}-latin-ext-${weight}-${style}.woff2`),
    );
    const src = (b: Buffer) =>
      `url(data:font/woff2;base64,${b.toString('base64')}) format('woff2')`;
    return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:${src(ext)};unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:block;src:${src(latin)};unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;
  };
  return [
    face('Bodoni Moda', '@fontsource/bodoni-moda', 'bodoni-moda', 500, 'normal'),
    face('Bodoni Moda', '@fontsource/bodoni-moda', 'bodoni-moda', 600, 'normal'),
    face('Bodoni Moda', '@fontsource/bodoni-moda', 'bodoni-moda', 500, 'italic'),
    face('Manrope', '@fontsource/manrope', 'manrope', 400, 'normal'),
    face('Manrope', '@fontsource/manrope', 'manrope', 600, 'normal'),
    face('Manrope', '@fontsource/manrope', 'manrope', 700, 'normal'),
  ].join('\n');
}

let fontsCss: string | null = null;
/** The @font-face rules for Bodoni Moda and Manrope (loaded once). */
export function brandFonts(): string {
  return (fontsCss ??= fontFaces());
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * HTML → PDF with headless Chromium (one browser, a fresh page per document), and PDF → text
 * for the leak scan. Set PDF_CHROMIUM_PATH to use a system Chromium in production.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly log = new Logger(PdfService.name);
  private browser: Promise<Browser> | null = null;

  private launch(): Promise<Browser> {
    this.browser ??= chromium
      .launch({
        executablePath: process.env.PDF_CHROMIUM_PATH || undefined,
        args: ['--no-sandbox', '--font-render-hinting=none'],
      })
      .catch((err: unknown) => {
        this.browser = null;
        this.log.error(`Chromium failed to start: ${String(err)}`);
        throw err;
      });
    return this.browser;
  }

  async render(html: string, opts: RenderOptions = {}): Promise<Buffer> {
    return (await this.renderWithText(html, opts)).pdf;
  }

  /** The PDF plus the text the page showed (for checking what a document says before it leaves). */
  async renderWithText(
    html: string,
    opts: RenderOptions = {},
  ): Promise<{ pdf: Buffer; text: string }> {
    const browser = await this.launch();
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      // Documents are self-contained: no network access at all.
      await page.route('**/*', (route) =>
        route.request().url().startsWith('data:') ? route.continue() : route.abort(),
      );
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate('document.fonts.ready.then(() => true)').catch(() => undefined);
      const footer = opts.footer
        ? `<div style="width:100%;padding:0 9mm;font-family:Helvetica,Arial,sans-serif;font-size:6.5pt;color:#6b665c;display:flex;justify-content:space-between;gap:8px">
             <span>${escapeHtml(opts.footer)}</span>
             <span style="white-space:nowrap">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
           </div>`
        : '<span></span>';
      const text = await page.innerText('body');
      const pdf = await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: footer,
        tagged: true,
      });
      return { pdf: Buffer.from(pdf), text };
    } finally {
      await context.close();
    }
  }

  /** All the text in a PDF, page by page (what a reader could copy out of it). */
  async text(pdf: Buffer): Promise<string> {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, verbosity: 0 });
    const doc = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join(''),
      );
    }
    await task.destroy();
    return pages.join('\n');
  }

  async onModuleDestroy() {
    const b = await this.browser?.catch(() => null);
    await b?.close();
  }
}
