import {
  agentLine,
  brandLine,
  describeSchedule,
  formatBps,
  formatDate,
  formatDateTime,
  formatINR,
  paymentSafetyNote,
  siteLabel,
  type OutwardQuote,
  type OutwardQuoteLeg,
} from '@shubhjets/shared';
import { brandLogo } from '../documents/vaanika-logo.js';
import { brandFonts } from '../pdf/pdf.service.js';

/**
 * The client quote (BRIEF.md §5.5): A5 portrait, one column, large figures, so it reads well in
 * WhatsApp on a phone and still prints cleanly. Bodoni Moda + Manrope, midnight and champagne gold.
 * It receives only the client-safe `OutwardQuote`: it has no way to print a cost or a margin.
 */

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const money = (p: number) => esc(formatINR(p));
const lines = (s: string | null) =>
  esc(s)
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);

function weekdayDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
  return `${wd}, ${formatDate(iso)}`;
}

function departure(leg: OutwardQuoteLeg): string {
  if (leg.windowFrom && leg.windowTo) return `Departure ${leg.windowFrom}–${leg.windowTo}`;
  if (leg.windowFrom) return `Departure from ${leg.windowFrom}`;
  if (leg.windowTo) return `Departure by ${leg.windowTo}`;
  return 'Departure time to be agreed';
}

function weddingDates(q: OutwardQuote): string | null {
  const { startsOn, endsOn } = q.wedding;
  if (!startsOn) return null;
  if (!endsOn || endsOn === startsOn) return formatDate(startsOn);
  const [a, b] = [formatDate(startsOn), formatDate(endsOn)];
  const [ad, am, ay] = a.split(' ');
  const [bd, bm, by] = b.split(' ');
  if (ay === by && am === bm) return `${ad}–${bd} ${bm} ${by}`;
  if (ay === by) return `${ad} ${am} – ${bd} ${bm} ${by}`;
  return `${a} – ${b}`;
}

function legCard(leg: OutwardQuoteLeg): string {
  const jets = leg.lines
    .map(
      (l) => `
      <div class="jet">
        <div class="jet-main">
          <div class="jet-name">${esc(l.aircraft)}${l.seats ? `<span class="seats"> · ${l.seats} seats</span>` : ''}</div>
          <div class="op">Operated by ${esc(l.operator)}${l.operatorPermit ? `, DGCA permit ${esc(l.operatorPermit)}` : ''}</div>
        </div>
        <div class="price">${money(l.price)}</div>
      </div>`,
    )
    .join('');
  return `
  <section class="leg">
    <div class="eyebrow">${leg.service ? `${esc(leg.service)} · ` : `Flight ${leg.seq} · `}${esc(weekdayDate(leg.date))}</div>
    <div class="route">${esc(leg.fromSite ? siteLabel(leg.fromSite) : leg.from.city)} <span class="arrow">→</span> ${esc(leg.toSite ? siteLabel(leg.toSite) : leg.to.city)}</div>
    <div class="meta">${esc(leg.fromSite ? 'Venue / helipad' : leg.from.iata)} → ${esc(leg.toSite ? 'Venue / helipad' : leg.to.iata)} · ${esc(departure(leg))} · ${leg.pax} guest${leg.pax === 1 ? '' : 's'}</div>
    ${jets}
    ${leg.lines.length > 1 ? `<div class="leg-total"><span>${leg.service ? esc(leg.service) : `Flight ${leg.seq}`}, ${leg.lines.length} aircraft</span><span>${money(leg.price)}</span></div>` : ''}
  </section>`;
}

export function renderQuoteHtml(q: OutwardQuote): string {
  const b = q.business;
  const dates = weddingDates(q);
  const gstRows = q.gst.intraState
    ? `<tr><td>CGST ${esc(formatBps(q.gst.rateBps / 2))}</td><td>${money(q.gst.cgst)}</td></tr>
       <tr><td>SGST ${esc(formatBps(q.gst.rateBps / 2))}</td><td>${money(q.gst.sgst)}</td></tr>`
    : `<tr><td>IGST ${esc(formatBps(q.gst.rateBps))}</td><td>${money(q.gst.igst)}</td></tr>`;
  const cancel = describeSchedule(q.cancellation.schedule);
  const included = lines(q.inclusions);
  const excluded = lines(q.exclusions);
  const logo = brandLogo(b.logo, b.brandName);
  const brand = logo
    ? `<img class="logo" src="${logo}" alt="${esc(b.brandName)}">`
    : `<div class="wordmark">${esc(b.brandName)}</div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(b.brandName)} quote ${esc(q.reference)}</title>
<style>
${brandFonts()}
@page { size: 148mm 210mm; margin: 11mm 0 13mm; }
@page :first { margin-top: 0; }
:root {
  --ink: #1a1a22; --muted: #5d584f; --gold: #d4b26a; --gold-ink: #7a5a1e;
  --midnight: #0b1020; --panel: #121935; --ivory: #f6f1e7; --line: #e7dfcf; --paper: #ffffff;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Manrope', sans-serif; font-size: 9.6pt; line-height: 1.45; color: var(--ink);
  background: var(--paper); -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.serif { font-family: 'Bodoni Moda', serif; }
.hero { background: var(--midnight); color: #f3ede2; padding: 9mm 9mm 16mm; position: relative; }
.hero::after { content: ''; position: absolute; left: 9mm; right: 9mm; bottom: 9mm; border-top: 0.4pt solid rgba(212,178,106,.45); }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; }
.wordmark { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 24pt; letter-spacing: .3pt; color: var(--gold); line-height: 1; }
.logo { max-height: 14mm; max-width: 55mm; }
.tag { font-size: 7.4pt; letter-spacing: .5pt; text-transform: uppercase; color: #c9c2b5; margin-top: 2.4mm; }
.ref { text-align: right; font-size: 7.6pt; color: #c9c2b5; line-height: 1.6; }
.ref strong { display: block; color: var(--gold); font-size: 8.6pt; letter-spacing: .5pt; text-transform: uppercase; }
.for { margin-top: 7mm; }
.for .label { font-size: 7.4pt; letter-spacing: .5pt; text-transform: uppercase; color: var(--gold); }
.for .name { font-family: 'Bodoni Moda', serif; font-weight: 500; font-size: 19pt; line-height: 1.15; margin-top: 1.5mm; }
.for .occasion { font-family: 'Bodoni Moda', serif; font-style: italic; font-size: 11.5pt; color: #e6dcc8; margin-top: 1mm; }

.total {
  margin: -11mm 9mm 0; position: relative; background: var(--paper); border: 0.6pt solid var(--gold);
  border-radius: 3mm; padding: 4.5mm 5mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 4mm;
  box-shadow: 0 1.2mm 3.5mm rgba(11,16,32,.08);
}
.total .label { font-size: 7.4pt; letter-spacing: .5pt; text-transform: uppercase; color: var(--gold-ink); font-weight: 700; }
.total .amount { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 25pt; line-height: 1.05; margin-top: 1mm; }
.total .valid { text-align: right; font-size: 7.8pt; color: var(--muted); line-height: 1.5; }
.total .valid strong { color: var(--ink); display: block; font-size: 8.6pt; }

.sheet { padding: 0 9mm; }
h2 {
  font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 13pt; margin: 6mm 0 2.6mm;
  display: flex; align-items: center; gap: 3mm; break-after: avoid;
}
h2::after { content: ''; flex: 1; border-top: 0.5pt solid var(--gold); opacity: .7; }
.leg { border: 0.5pt solid var(--line); border-radius: 2.6mm; padding: 3.4mm 4mm; margin-bottom: 2.6mm; break-inside: avoid; background: #fff; }
.eyebrow { font-size: 7.2pt; letter-spacing: .5pt; text-transform: uppercase; color: var(--gold-ink); font-weight: 700; }
.route { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 15pt; line-height: 1.2; margin-top: 1mm; }
.arrow { color: var(--gold); font-family: 'Manrope', sans-serif; font-weight: 400; }
.meta { font-size: 8.4pt; color: var(--muted); margin-top: .8mm; }
.jet { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; border-top: 0.4pt dashed var(--line); margin-top: 2.4mm; padding-top: 2.4mm; }
.jet-name { font-weight: 700; font-size: 10pt; }
.seats { font-weight: 400; color: var(--muted); }
.op { font-size: 7.8pt; color: var(--muted); margin-top: .4mm; }
.price { font-weight: 700; font-size: 11pt; white-space: nowrap; }
.leg-total { display: flex; justify-content: space-between; font-size: 8.4pt; color: var(--gold-ink); font-weight: 700; margin-top: 2.5mm; }

table { width: 100%; border-collapse: collapse; }
.sum td { padding: 1.4mm 0; border-bottom: 0.4pt solid var(--line); font-size: 9.6pt; }
.sum td:last-child { text-align: right; white-space: nowrap; font-weight: 600; }
.sum tr.grand td { border-bottom: 0; border-top: 0.8pt solid var(--ink); padding-top: 2.6mm; font-family: 'Bodoni Moda', serif; font-size: 14pt; font-weight: 600; }
.small { font-size: 7.8pt; color: var(--muted); }
.box { background: var(--ivory); border-radius: 2.6mm; padding: 3.6mm 4.2mm; break-inside: avoid; }
.pay td { padding: 1.4mm 0; font-size: 9.4pt; }
.pay td:last-child { text-align: right; font-weight: 700; white-space: nowrap; }
.bank { margin-top: 2.6mm; border-top: 0.4pt solid #ddd3bf; padding-top: 2.4mm; font-size: 8.4pt; line-height: 1.55; }
.bank b { font-weight: 700; }
.bank-safety { margin-top: 1.6mm; font-size: 7.6pt; line-height: 1.45; color: #5d584f; }
.two { display: flex; gap: 4mm; }
.two > div { flex: 1; min-width: 0; }
ul { margin: 0; padding-left: 4mm; }
li { margin: .6mm 0; font-size: 8.8pt; }
.k { font-size: 7.4pt; letter-spacing: .5pt; text-transform: uppercase; color: var(--gold-ink); font-weight: 700; margin-bottom: 1.2mm; }
.cancel td { padding: 1.3mm 0; border-bottom: 0.4pt solid var(--line); font-size: 8.8pt; vertical-align: top; }
.cancel td:last-child { text-align: right; font-weight: 700; padding-left: 3mm; }
.notes p { font-size: 7.8pt; color: var(--muted); margin: 0 0 1.3mm; }
.sign { margin-top: 5mm; display: flex; justify-content: space-between; align-items: flex-end; break-inside: avoid; }
.sign .who { font-size: 8.4pt; }
.sign .who b { display: block; font-size: 9.4pt; }
.thanks { font-family: 'Bodoni Moda', serif; font-style: italic; font-size: 12pt; color: var(--gold-ink); }
.watermark {
  position: fixed; top: 45%; left: 0; right: 0; text-align: center; transform: rotate(-24deg);
  font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 34pt; letter-spacing: 1pt; color: rgba(194,65,45,.13); z-index: 10;
}
</style></head>
<body>
${q.preview ? '<div class="watermark">PREVIEW · NOT SENT</div>' : ''}
<header class="hero">
  <div class="top">
    <div>${brand}<div class="tag">Private jets &amp; helicopters for Indian weddings</div></div>
    <div class="ref"><strong>Quotation</strong>${esc(q.reference)}<br>${esc(formatDate(q.issuedAt.slice(0, 10)))}</div>
  </div>
  <div class="for">
    <div class="label">Prepared for</div>
    <div class="name">${esc(q.client.name ?? 'Our guests')}</div>
    ${q.wedding.city || dates ? `<div class="occasion">${esc([q.wedding.city ? `${q.wedding.city} wedding` : 'Wedding', dates].filter(Boolean).join(' · '))}</div>` : ''}
  </div>
</header>

<div class="total">
  <div><div class="label">Total, including GST</div><div class="amount">${money(q.total)}</div></div>
  ${q.validUntil ? `<div class="valid">Valid until<strong>${esc(formatDateTime(new Date(q.validUntil)))}</strong></div>` : ''}
</div>

<main class="sheet">
  <h2>Your flights</h2>
  ${q.legs.map(legCard).join('')}
  ${
    q.extras.length
      ? `<h2>Extras</h2><div class="box"><table class="sum">${q.extras
          .map((e) => `<tr><td>${esc(e.description)}</td><td>${money(e.price)}</td></tr>`)
          .join('')}</table></div>`
      : ''
  }

  <h2>Price</h2>
  <table class="sum">
    <tr><td>Charter${q.extras.length ? ' and extras' : ''}</td><td>${money(q.subtotal)}</td></tr>
    ${gstRows}
    <tr class="grand"><td>Total</td><td>${money(q.total)}</td></tr>
  </table>
  <p class="small">${q.gst.feeOnly ? 'GST is charged on our service fee. ' : ''}${q.gst.sac ? `SAC ${esc(q.gst.sac)}. ` : ''}${b.gstin ? `Our GSTIN ${esc(b.gstin)}. ` : ''}This is a quotation, not a tax invoice.</p>

  <h2>Payment</h2>
  <div class="box">
    <table class="pay">${q.payment.map((p) => `<tr><td>${esc(p.label)}</td><td>${money(p.amount)}</td></tr>`).join('')}</table>
    ${
      q.bank
        ? `<div class="bank">Bank transfer to <b>${esc(q.bank.accountName)}</b><br>
           ${esc(q.bank.bankName)}${q.bank.branch ? `, ${esc(q.bank.branch)}` : ''} · A/c <b>${esc(q.bank.accountNumber)}</b> · IFSC <b>${esc(q.bank.ifsc)}</b></div><div class="bank-safety">${esc(paymentSafetyNote(b.legalName ?? b.brandName))}</div>`
        : ''
    }
  </div>

  ${
    included.length || excluded.length
      ? `<h2>What’s included</h2><div class="two">
          ${included.length ? `<div><div class="k">Included</div><ul>${included.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
          ${excluded.length ? `<div><div class="k">Not included</div><ul>${excluded.map((x) => `<li>${x}</li>`).join('')}</ul></div>` : ''}
        </div>`
      : ''
  }

  <h2>Cancellation</h2>
  <table class="cancel">
    ${cancel.map((r) => `<tr><td>${esc(r.when)}</td><td>${esc(r.charge)}</td></tr>`).join('')}
  </table>
  ${q.cancellation.note ? `<p class="small" style="margin-top:2mm">${lines(q.cancellation.note).join('<br>')}</p>` : ''}

  <h2>Good to know</h2>
  <div class="notes">
    <p>${esc(agentLine(b.brandName))} The operator named above holds the DGCA Non-Scheduled Operator Permit and keeps full operational control; the pilot-in-command has the final say on safety, weather and timing.</p>
    <p>Aircraft, timings and prices are held only once the booking is confirmed with payment; until then they depend on availability.</p>
    <p>Every guest needs a valid government photo ID. We will ask for names and ID details before the flight.</p>
  </div>

  <div class="sign">
    <div class="who">${b.signatoryName ? `<b>${esc(b.signatoryName)}</b>${esc(b.signatoryDesignation ?? '')}<br>` : ''}${esc(b.legalName ?? b.brandName)}${b.address ? `<br><span class="small">${esc(b.address).replace(/\s*\n\s*/g, ', ')}</span>` : ''}</div>
    <div class="thanks">With warm wishes</div>
  </div>
</main>
</body></html>`;
}

/** The small line at the foot of every page. */
export function quoteFooter(q: OutwardQuote): string {
  const b = q.business;
  return [
    brandLine(b.brandName, b.legalName),
    b.llpin ? `LLPIN ${b.llpin}` : null,
    b.gstin ? `GSTIN ${b.gstin}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
