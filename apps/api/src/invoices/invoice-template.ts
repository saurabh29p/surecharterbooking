import {
  formatBps,
  formatDate,
  formatINR,
  outwardRoute,
  rupeesInWords,
  stateName,
  type OutwardQuote,
} from '@shubhjets/shared';
import { documentHtml, esc } from '../documents/brand.js';

export interface InvoiceView {
  number: string;
  issuedOn: string;
  supplier: {
    brandName: string;
    legalName: string;
    address: string;
    gstin: string;
    llpin: string | null;
    stateCode: string;
    signatoryName: string | null;
    signatoryDesignation: string | null;
  };
  buyer: { name: string; address: string; gstin: string | null };
  placeOfSupplyState: string;
  sac: string;
  quote: OutwardQuote;
  logo: string | null;
}

const money = (p: number) => esc(formatINR(p));

/**
 * The GST tax invoice (full-value model): every detail Rule 46 of the CGST Rules asks for —
 * supplier and recipient with GSTIN and address, serial number, date, SAC, description, taxable
 * value, tax rate and amount, place of supply, reverse charge, amount in words, signature.
 * Built from the client-safe quote only: prices, never costs or margins.
 */
export function renderInvoiceHtml(v: InvoiceView): string {
  const q = v.quote;
  const items: Array<{ desc: string; amount: number }> = [
    ...q.legs.flatMap((l) =>
      l.lines.map((x) => ({
        desc: `${l.service ?? 'Charter flight'} ${outwardRoute(l, true)}, ${formatDate(l.date)}: ${x.aircraft}${x.seats ? `, ${x.seats} seats` : ''}, operated by ${x.operator}`,
        amount: x.price,
      })),
    ),
    ...q.extras.map((e) => ({ desc: e.description, amount: e.price })),
  ];
  const lines = items.map(
    (it, i) =>
      `<tr><td>${i + 1}</td><td>${esc(it.desc)}</td><td>${esc(v.sac)}</td><td class="num">1</td><td class="num">${money(it.amount)}</td></tr>`,
  );
  const half = formatBps(q.gst.rateBps / 2);
  const taxRows = q.gst.intraState
    ? `<tr><td colspan="4" class="num">CGST @ ${half}</td><td class="num">${money(q.gst.cgst)}</td></tr>
       <tr><td colspan="4" class="num">SGST @ ${half}</td><td class="num">${money(q.gst.sgst)}</td></tr>`
    : `<tr><td colspan="4" class="num">IGST @ ${formatBps(q.gst.rateBps)}</td><td class="num">${money(q.gst.igst)}</td></tr>`;
  const s = v.supplier;
  const pos = `${stateName(v.placeOfSupplyState) ?? v.placeOfSupplyState} (${v.placeOfSupplyState})`;
  const body = `
  <div class="grid">
    <div class="box">
      <div class="k">Supplier</div>
      <div class="name">${esc(s.legalName)}</div>
      <div>${esc(s.address).replace(/\n/g, '<br>')}</div>
      <div>GSTIN <b>${esc(s.gstin)}</b>${s.llpin ? ` · LLPIN ${esc(s.llpin)}` : ''}</div>
      <div>State: ${esc(stateName(s.stateCode) ?? s.stateCode)} (${esc(s.stateCode)})</div>
    </div>
    <div class="box">
      <div class="k">Invoice</div>
      <table class="kv">
        <tr><td>Invoice no.</td><td><b>${esc(v.number)}</b></td></tr>
        <tr><td>Date</td><td>${esc(formatDate(v.issuedOn))}</td></tr>
        <tr><td>Place of supply</td><td>${esc(pos)}</td></tr>
        <tr><td>Reverse charge</td><td>No</td></tr>
        <tr><td>Reference</td><td>${esc(q.reference)}</td></tr>
      </table>
    </div>
  </div>
  <div class="box bill">
    <div class="k">Bill to</div>
    <div class="name">${esc(v.buyer.name)}</div>
    <div>${esc(v.buyer.address).replace(/\n/g, '<br>')}</div>
    <div>GSTIN: ${v.buyer.gstin ? `<b>${esc(v.buyer.gstin)}</b>` : 'Unregistered'}</div>
  </div>
  <table class="items">
    <thead><tr><th>#</th><th>Description of service</th><th>SAC</th><th class="num">Qty</th><th class="num">Taxable value</th></tr></thead>
    <tbody>
      ${lines.join('')}
      <tr class="sub"><td colspan="4" class="num">Total taxable value</td><td class="num">${money(q.subtotal)}</td></tr>
      ${taxRows}
      <tr class="grand"><td colspan="4" class="num">Invoice total</td><td class="num">${money(q.total)}</td></tr>
    </tbody>
  </table>
  <p class="words"><b>Amount in words:</b> ${esc(rupeesInWords(q.total))}</p>
  ${
    q.bank
      ? `<div class="box pay"><div class="k">Pay by bank transfer</div>
         ${esc(q.bank.accountName)} · ${esc(q.bank.bankName)}${q.bank.branch ? `, ${esc(q.bank.branch)}` : ''} · A/c <b>${esc(q.bank.accountNumber)}</b> · IFSC <b>${esc(q.bank.ifsc)}</b></div>`
      : ''
  }
  <div class="sign">
    <div class="small">Charter flights are operated by the licensed operators named above; ${esc(s.brandName)} arranges them as a broker.</div>
    <div class="sig">For <b>${esc(s.legalName)}</b><br><br><br>Authorised signatory${s.signatoryName ? `<br>${esc(s.signatoryName)}${s.signatoryDesignation ? `, ${esc(s.signatoryDesignation)}` : ''}` : ''}</div>
  </div>`;
  return documentHtml({
    title: 'Tax invoice',
    subtitle: `${v.number} · ${formatDate(v.issuedOn)}`,
    brandName: s.brandName,
    logo: v.logo,
    bodyHtml: body,
    page: 'A4',
    css: `
      .grid { display: flex; gap: 4mm; }
      .grid > .box { flex: 1; }
      .box { border: .5pt solid var(--line); border-radius: 2mm; padding: 3mm 3.6mm; margin-bottom: 3.5mm; font-size: 8.8pt; line-height: 1.55; break-inside: avoid; }
      .k { font-size: 7pt; letter-spacing: .5pt; text-transform: uppercase; color: var(--gold-ink); font-weight: 700; margin-bottom: 1mm; }
      .name { font-weight: 700; font-size: 10pt; }
      table.kv { margin: 0; } table.kv td { border: 0; padding: .4mm 0; } table.kv td:first-child { color: var(--muted); width: 32mm; }
      table.items td { font-size: 8.8pt; }
      tr.sub td { border-top: .8pt solid var(--ink); font-weight: 600; }
      tr.grand td { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 12.5pt; border-top: .8pt solid var(--ink); border-bottom: 0; }
      .words { font-size: 9pt; }
      .pay { background: var(--ivory); border: 0; }
      .sign { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; margin-top: 8mm; }
      .sign .small { font-size: 7.8pt; color: var(--muted); max-width: 95mm; }
      .sig { text-align: right; font-size: 8.8pt; }`,
  });
}
