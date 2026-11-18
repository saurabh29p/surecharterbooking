import { brandFonts } from '../pdf/pdf.service.js';

/** Escape text for HTML. */
export const esc = (s: string | null | undefined) =>
  (s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export interface DocumentShell {
  title: string;
  /** Small line under the title, e.g. the document reference. */
  subtitle?: string | null;
  brandName: string;
  /** data: URL of the uploaded logo, or null for the wordmark. */
  logo?: string | null;
  bodyHtml: string;
  /** Diagonal text on every page, e.g. "DRAFT – NOT FOR SIGNATURE". */
  watermark?: string | null;
  page?: 'A4' | 'A5';
  /** Extra CSS for this kind of document. */
  css?: string;
}

/**
 * The ShubhJets document look shared by agreements, invoices and rate requests (the quote has
 * its own phone-first layout): midnight band with the Bodoni Moda wordmark in champagne gold,
 * Manrope text, gold rules.
 */
export function documentHtml(d: DocumentShell): string {
  const size = d.page === 'A5' ? '148mm 210mm' : '210mm 297mm';
  const pad = d.page === 'A5' ? '9mm' : '16mm';
  const brand = d.logo
    ? `<img class="logo" src="${d.logo}" alt="${esc(d.brandName)}">`
    : `<div class="wordmark">${esc(d.brandName)}</div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
<style>
${brandFonts()}
@page { size: ${size}; margin: 12mm 0 14mm; }
@page :first { margin-top: 0; }
:root { --ink: #1a1a22; --muted: #5d584f; --gold: #d4b26a; --gold-ink: #7a5a1e; --midnight: #0b1020; --ivory: #f6f1e7; --line: #e7dfcf; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: 'Manrope', sans-serif; font-size: ${d.page === 'A5' ? '9.6pt' : '9.4pt'}; line-height: 1.5; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.band { background: var(--midnight); padding: 7mm ${pad} 6mm; display: flex; justify-content: space-between; align-items: center; gap: 6mm; }
.wordmark { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 20pt; color: var(--gold); line-height: 1; letter-spacing: .3pt; }
.logo { max-height: 12mm; max-width: 55mm; }
.band .tag { font-size: 7.2pt; letter-spacing: .5pt; text-transform: uppercase; color: #c9c2b5; text-align: right; }
.sheet { padding: 0 ${pad}; }
.doc-title { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: ${d.page === 'A5' ? '17pt' : '19pt'}; line-height: 1.2; margin: 7mm 0 1mm; }
.doc-sub { color: var(--muted); font-size: 8.6pt; margin-bottom: 5mm; padding-bottom: 3mm; border-bottom: .6pt solid var(--gold); }
h1 { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 17pt; text-align: center; margin: 7mm 0 4mm; letter-spacing: .4pt; }
h2 { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 11.5pt; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: .5pt solid rgba(212,178,106,.7); break-after: avoid; }
h3 { font-size: 9.8pt; margin: 4mm 0 1.5mm; break-after: avoid; }
p { margin: 0 0 2.4mm; text-align: justify; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 2.4mm; padding-left: 6mm; }
li { margin: .8mm 0; }
strong { font-weight: 700; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 3.5mm; break-inside: avoid; }
th { text-align: left; font-size: 7.6pt; text-transform: uppercase; letter-spacing: .4pt; color: var(--gold-ink); border-bottom: .8pt solid var(--ink); padding: 1.6mm 2mm; }
td { border-bottom: .4pt solid var(--line); padding: 1.8mm 2mm; vertical-align: top; }
td.num, th.num { text-align: right; white-space: nowrap; }
blockquote { margin: 5mm 0 0; padding: 3mm 4mm; background: var(--ivory); border-left: 1.2mm solid var(--gold); border-radius: 1.5mm; font-size: 8.4pt; color: var(--muted); break-inside: avoid; }
blockquote p { margin: 0; }
.missing { background: #fde2df; color: #8a1c12; padding: 0 1mm; border-radius: .8mm; font-weight: 700; }
.watermark { position: fixed; top: 44%; left: -10mm; right: -10mm; text-align: center; transform: rotate(-28deg); font-weight: 800; font-size: ${d.page === 'A5' ? '26pt' : '40pt'}; letter-spacing: 1pt; color: rgba(194,65,45,.14); z-index: 10; white-space: nowrap; }
${d.css ?? ''}
</style></head>
<body>
${d.watermark ? `<div class="watermark">${esc(d.watermark)}</div>` : ''}
<header class="band">${brand}<div class="tag">Private jets for Indian weddings</div></header>
<main class="sheet">
<div class="doc-title">${esc(d.title)}</div>
${d.subtitle ? `<div class="doc-sub">${esc(d.subtitle)}</div>` : ''}
${d.bodyHtml}
</main>
</body></html>`;
}
