import {
  describeSchedule,
  formatDate,
  formatINR,
  type CancellationSchedule,
  type OutwardQuote,
  type PaymentPart,
} from '@shubhjets/shared';
import { esc } from './brand.js';

/** Table placeholders for agreements, built from client-safe data only. */

export function scheduleTable(schedule: CancellationSchedule | null | undefined): string | null {
  if (!schedule?.length) return null;
  const rows = describeSchedule(schedule)
    .map((r) => `<tr><td>${esc(r.when)}</td><td class="num">${esc(r.charge)}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>Cancellation notified</th><th class="num">Charge</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function paymentTable(parts: readonly PaymentPart[] | null | undefined): string | null {
  if (!parts?.length) return null;
  const rows = parts
    .map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${esc(formatINR(p.amount))}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>Instalment</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const window = (from: string | null, to: string | null) =>
  from && to ? `${from}–${to}` : from ? `from ${from}` : to ? `by ${to}` : 'to be agreed';

export function itineraryTable(
  q: Pick<OutwardQuote, 'legs' | 'extras'> | null | undefined,
): string | null {
  if (!q?.legs.length) return null;
  const rows = q.legs
    .flatMap((l) =>
      l.lines.map(
        (x, i) => `<tr>
          <td>${i === 0 ? `<strong>${l.seq}</strong>` : ''}</td>
          <td>${i === 0 ? `${esc(l.from.city)} (${esc(l.from.iata)}) → ${esc(l.to.city)} (${esc(l.to.iata)})<br><span style="color:#5d584f">${esc(formatDate(l.date))}, departure ${esc(window(l.windowFrom, l.windowTo))}, ${l.pax} passengers</span>` : ''}</td>
          <td>${esc(x.aircraft)}${x.seats ? `, ${x.seats} seats` : ''}<br><span style="color:#5d584f">${esc(x.operator)}${x.operatorPermit ? `, NSOP ${esc(x.operatorPermit)}` : ''}</span></td>
          <td class="num">${esc(formatINR(x.price))}</td>
        </tr>`,
      ),
    )
    .join('');
  const extras = q.extras
    .map(
      (e) =>
        `<tr><td></td><td colspan="2">${esc(e.description)}</td><td class="num">${esc(formatINR(e.price))}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>#</th><th>Flight</th><th>Aircraft and operator</th><th class="num">Price</th></tr></thead><tbody>${rows}${extras}</tbody></table>`;
}
