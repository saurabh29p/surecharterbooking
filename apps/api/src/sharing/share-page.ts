import {
  formatDate,
  formatDateTime,
  formatINR,
  outwardRoute,
  type OutwardQuote,
} from '@shubhjets/shared';
import { esc } from '../documents/brand.js';
import { webFonts } from '../pdf/pdf.service.js';

export interface SharePageInput {
  token: string;
  brand: string;
  legalLine: string | null;
  title: string;
  reference: string | null;
  /** Client-safe quote content (quotes only). */
  quote: OutwardQuote | null;
  quoteState: 'LIVE' | 'EXPIRED' | 'ACCEPTED' | 'REPLACED' | null;
  /** This link's own acceptance, if any. */
  accepted: { name: string; at: Date } | null;
  linkExpiresAt: Date | null;
  error?: string | null;
}

/** Strict headers for public share pages: no scripts, no framing, not indexed, no referrer. */
export const PAGE_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
};

function shell(title: string, body: string, brand: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
${webFonts()}
:root{--ink:#1a1a22;--muted:#5d584f;--gold:#d4b26a;--gold-ink:#7a5a1e;--midnight:#0b1020;--ivory:#f6f1e7;--line:#e7dfcf}
*{box-sizing:border-box}html,body{margin:0;background:#f6f1e7;color:var(--ink);font-family:'Manrope',system-ui,sans-serif;font-size:16px;line-height:1.5}
.band{background:var(--midnight);padding:20px 16px 56px}
.wm{font-family:'Bodoni Moda',Georgia,serif;font-weight:600;font-size:28px;color:var(--gold);line-height:1}
.tag{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#c9c2b5;margin-top:6px}
.wrap{max-width:560px;margin:-40px auto 0;padding:0 16px 32px}
.card{background:#fff;border-radius:14px;padding:18px 16px;margin-bottom:12px;box-shadow:0 2px 10px rgba(11,16,32,.06)}
.k{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--gold-ink);font-weight:700}
h1{font-family:'Bodoni Moda',Georgia,serif;font-weight:600;font-size:26px;line-height:1.2;margin:4px 0 2px}
.muted{color:var(--muted);font-size:14px}
.total{font-family:'Bodoni Moda',Georgia,serif;font-weight:600;font-size:34px;line-height:1.1;margin-top:4px}
.leg{border-top:1px solid var(--line);padding:10px 0}.leg:first-child{border-top:0}
.route{font-weight:700}
.btn{display:block;width:100%;text-align:center;border-radius:999px;padding:14px 18px;min-height:48px;font-weight:700;font-size:16px;text-decoration:none;border:0;cursor:pointer;font-family:inherit;transition:transform .12s ease-out,box-shadow .15s ease-out}
.btn:active{transform:scale(.98)}
.btn-gold{background:var(--gold);color:#1a1a22;box-shadow:0 4px 14px rgba(212,178,106,.35)}
.btn-gold:hover{box-shadow:0 6px 20px rgba(212,178,106,.5)}
.btn-dark{background:var(--midnight);color:#fff}
.btn:focus-visible,input:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
label{display:block;font-weight:700;margin:10px 0 6px}
input[type=text]{width:100%;font-size:16px;padding:12px;border:1px solid #cfc7b6;border-radius:10px;font-family:inherit}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin:12px 0}
.check input{width:22px;height:22px;margin-top:2px;flex:0 0 22px}
.note{background:var(--ivory);border-radius:10px;padding:10px 12px;font-size:14px}
.ok{background:#dcf2e4;color:#145c36}.warn{background:#fff1e0;color:#6b4300}.err{background:#fde2df;color:#8a1c12}
.foot{text-align:center;font-size:12px;color:var(--muted);margin-top:16px}
@media (prefers-reduced-motion:reduce){.btn{transition:none}}
</style></head><body>
<header class="band"><div class="wm">${esc(brand)}</div><div class="tag">Private jets for Indian weddings</div></header>
<main class="wrap">${body}</main></body></html>`;
}

/** The page a client, partner or operator sees when they open a secure link. */
export function renderSharePage(p: SharePageInput): string {
  const q = p.quote;
  const pdf = `<a class="btn btn-dark" href="${esc(p.token)}/pdf">Open the PDF</a>`;
  let main = `<section class="card"><div class="k">${esc(p.title)}</div>
    ${q ? `<h1>${esc(q.client.name ?? 'Your quote')}</h1><div class="muted">${esc([q.wedding.city ? `${q.wedding.city} wedding` : null, q.reference].filter(Boolean).join(' · '))}</div>` : `<h1>${esc(p.reference ?? p.title)}</h1>`}
  </section>`;
  if (q) {
    main += `<section class="card">
      <div class="k">Total, including GST</div>
      <div class="total">${esc(formatINR(q.total))}</div>
      ${q.validUntil ? `<div class="muted">Valid until ${esc(formatDateTime(new Date(q.validUntil)))}</div>` : ''}
      <div style="margin-top:10px">${q.legs
        .map(
          (l) => `<div class="leg"><div class="route">${esc(outwardRoute(l))}</div>
          <div class="muted">${l.service ? `${esc(l.service)} · ` : ''}${esc(formatDate(l.date))} · ${l.pax} guests · ${esc(l.lines.map((x) => x.aircraft).join(' + '))}</div></div>`,
        )
        .join('')}</div>
    </section>`;
  }
  main += `<section class="card">${pdf}</section>`;

  if (q) {
    if (p.accepted) {
      main += `<section class="card note ok">Thank you, <b>${esc(p.accepted.name)}</b>. Your acceptance was received on ${esc(formatDateTime(p.accepted.at))}. ${esc(p.brand)} will confirm your booking with you.</section>`;
    } else if (p.quoteState === 'LIVE') {
      main += `<section class="card"><form method="post" action="${esc(p.token)}/accept">
        <div class="k">Happy to go ahead?</div>
        ${p.error ? `<div class="note err" role="alert" style="margin-top:8px">${esc(p.error)}</div>` : ''}
        <label for="n">Your full name</label>
        <input id="n" name="name" type="text" autocomplete="name" maxlength="120" required>
        <label class="check"><input type="checkbox" name="agree" value="yes" required>
          <span>I accept this quote, including the cancellation charges in the PDF.</span></label>
        <button class="btn btn-gold" type="submit">I accept</button>
        <p class="muted" style="margin:10px 0 0">This tells ${esc(p.brand)} you would like to go ahead. Your booking is confirmed once the charter terms are signed and payment is received.</p>
      </form></section>`;
    } else {
      const msg =
        p.quoteState === 'ACCEPTED'
          ? 'This quote has been accepted.'
          : p.quoteState === 'REPLACED'
            ? `This quote has been replaced by a newer one. Please ask ${p.brand} for the latest.`
            : `This quote has expired. Please ask ${p.brand} for fresh rates.`;
      main += `<section class="card note ${p.quoteState === 'ACCEPTED' ? 'ok' : 'warn'}">${esc(msg)}</section>`;
    }
  }
  main += `<div class="foot">${p.legalLine ? `${esc(p.legalLine)}<br>` : ''}${p.linkExpiresAt ? `This link works until ${esc(formatDate(p.linkExpiresAt.toISOString().slice(0, 10)))}.` : ''}</div>`;
  return shell(`${p.title} · ${p.brand}`, main, p.brand);
}

/** Expired, revoked or unknown links. */
export function renderLinkGone(brand: string, why: 'EXPIRED' | 'REVOKED' | 'UNKNOWN'): string {
  const text =
    why === 'UNKNOWN'
      ? 'This link is not valid. Please check you copied all of it.'
      : `This link has ${why === 'EXPIRED' ? 'expired' : 'been switched off'}. Please ask ${brand} to send a new one.`;
  return shell(
    `Link not available · ${brand}`,
    `<section class="card"><h1>Link not available</h1><p class="muted">${esc(text)}</p></section>`,
    brand,
  );
}
