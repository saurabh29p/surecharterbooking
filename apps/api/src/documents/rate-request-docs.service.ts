import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  CATEGORY_LABELS,
  formatDate,
  HELI_SERVICE_LABELS,
  siteLabel,
  type AircraftCategory,
  type HeliService,
  type LegSite,
} from '@shubhjets/shared';
import type { DataSource } from 'typeorm';
import { BusinessProfilesService } from '../business-profiles/business-profiles.service.js';
import { FilesService } from '../files/files.service.js';
import { PdfService } from '../pdf/pdf.service.js';
import { longDate } from './agreements.service.js';
import { documentHtml, esc } from './brand.js';
import { DocumentRecord, DocumentVersion } from './document.entities.js';

/** Map links for venue / helipad ends, so the operator can check the landing spot. */
function siteLinks(from: LegSite | null, to: LegSite | null): string {
  const parts = [from, to]
    .filter((s): s is LegSite & { mapUrl: string } => !!s?.mapUrl)
    .map((s) => `${esc(s.name)}: <a href="${esc(s.mapUrl)}">${esc(s.mapUrl)}</a>`);
  return parts.length ? `<div class="meta map">${parts.join('<br>')}</div>` : '';
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');

/**
 * The rate request as a branded A5 PDF for the operator (BRIEF.md §5.5): route, date, departure
 * window, passengers and aircraft size per leg, and what to reply with. It names the wedding by
 * code and city only: never the client, the partner or any price.
 */
@Injectable()
export class RateRequestDocsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly profiles: BusinessProfilesService,
    private readonly pdf: PdfService,
    private readonly files: FilesService,
  ) {}

  async generate(rateRequestId: string, userId: string) {
    const [rq] = await this.ds.query(
      `SELECT rq.id, rq.sent_at, rq.wedding_id, rq.operator_id, rq.document_id,
              coalesce(o.brand, o.legal_name) AS operator, w.code, w.venue_city, w.business_profile_id
         FROM rate_request rq JOIN operator o ON o.id = rq.operator_id JOIN wedding w ON w.id = rq.wedding_id
        WHERE rq.id = $1`,
      [rateRequestId],
    );
    if (!rq) throw new NotFoundException('Rate request not found');
    const legs: {
      seq: number;
      from_city: string;
      from_iata: string;
      to_city: string;
      to_iata: string;
      flight_date: string;
      window_from: string | null;
      window_to: string | null;
      pax: number;
      category: AircraftCategory | null;
      from_site: LegSite | null;
      to_site: LegSite | null;
      service_type: HeliService | null;
    }[] = await this.ds.query(
      `SELECT l.seq, fa.city AS from_city, l.from_iata, ta.city AS to_city, l.to_iata, l.flight_date,
              to_char(l.window_from, 'HH24:MI') AS window_from, to_char(l.window_to, 'HH24:MI') AS window_to,
              l.pax, l.category, l.from_site, l.to_site, l.service_type
         FROM rate_request_leg rl JOIN leg l ON l.id = rl.leg_id
         JOIN airport fa ON fa.iata = l.from_iata JOIN airport ta ON ta.iata = l.to_iata
        WHERE rl.rate_request_id = $1 ORDER BY l.seq`,
      [rateRequestId],
    );
    const profile = rq.business_profile_id
      ? await this.profiles.get(rq.business_profile_id)
      : await this.profiles.getDefault();
    const brand = profile?.brandName ?? 'ShubhJets';

    const heli = legs.some((l) => l.from_site || l.to_site || l.service_type);
    const rows = legs
      .map(
        (l) => `<div class="leg">
          <div class="eyebrow">${l.service_type ? `Leg ${l.seq} · ${esc(HELI_SERVICE_LABELS[l.service_type])}` : `Flight ${l.seq}`} · ${esc(formatDate(l.flight_date))}</div>
          <div class="route">${esc(l.from_site ? siteLabel(l.from_site) : l.from_city)} <span class="arrow">→</span> ${esc(l.to_site ? siteLabel(l.to_site) : l.to_city)}</div>
          ${siteLinks(l.from_site, l.to_site)}
          <div class="meta">${esc(l.from_iata)} → ${esc(l.to_iata)}${l.from_site || l.to_site ? ' (nearest airports)' : ''} · departure ${esc(
            l.window_from && l.window_to
              ? `${l.window_from}–${l.window_to}`
              : l.window_from
                ? `from ${l.window_from}`
                : l.window_to
                  ? `by ${l.window_to}`
                  : 'time flexible',
          )}</div>
          <div class="facts"><span><b>${l.pax}</b> passengers</span>${
            l.category ? `<span>${esc(CATEGORY_LABELS[l.category])} or larger</span>` : ''
          }</div>
        </div>`,
      )
      .join('');
    const body = `
      <p>Dear ${esc(rq.operator)} team,</p>
      <p>We would like your rates for the following charter flights for a wedding${rq.venue_city ? ` in ${esc(rq.venue_city)}` : ''} (our reference <b>${esc(rq.code)}</b>).</p>
      ${rows}
      <h2>Please reply with</h2>
      <ul>
        <li>Aircraft type, registration and number of seats</li>
        <li>All-inclusive net rate (before GST), per flight or as a package</li>
        <li>What is included and not included (positioning, crew stay, catering, airport charges)</li>
        <li>Your cancellation charges, by days before departure</li>
        <li>How long the rate is valid</li>
        ${heli ? '<li>For helicopters: rate per flying hour, flying time, positioning and waiting charges, and whether you will check the landing site and help with local permissions</li>' : ''}
      </ul>
      <p>Only verified operators with a valid NSOP and insurance are considered. Thank you.</p>
      <p class="sign">${esc(profile?.signatoryName ?? brand)}<br><span>${esc(profile?.legalName ?? brand)}</span></p>`;
    const html = documentHtml({
      title: 'Rate request',
      subtitle: `${rq.code} · ${longDate(new Date(rq.sent_at))}`,
      brandName: brand,
      bodyHtml: body,
      page: 'A5',
      css: `
        .leg { border: .5pt solid var(--line); border-radius: 2.4mm; padding: 3mm 3.6mm; margin-bottom: 2.4mm; break-inside: avoid; }
        .eyebrow { font-size: 7pt; letter-spacing: .5pt; text-transform: uppercase; color: var(--gold-ink); font-weight: 700; }
        .route { font-family: 'Bodoni Moda', serif; font-weight: 600; font-size: 13.5pt; margin-top: .6mm; }
        .arrow { color: var(--gold); font-family: 'Manrope', sans-serif; font-weight: 400; }
        .meta { font-size: 8.2pt; color: var(--muted); }
        .map a { color: var(--ink); word-break: break-all; }
        .facts { display: flex; gap: 4mm; margin-top: 1.4mm; font-size: 9pt; }
        p { text-align: left; }
        .sign { margin-top: 5mm; font-weight: 700; }
        .sign span { font-weight: 400; color: var(--muted); font-size: 8.4pt; }`,
    });
    const pdf = await this.pdf.render(html, {
      footer: profile?.legalName ? `${brand} is a service of ${profile.legalName}` : brand,
    });

    return this.ds.transaction(async (m) => {
      const file = await this.files.upload(
        {
          buffer: pdf,
          originalName: `${safe(brand)}-Rate-Request-${safe(rq.code)}-${safe(rq.operator)}.pdf`,
          purpose: 'document',
        },
        m,
      );
      const docRepo = m.getRepository(DocumentRecord);
      let doc = rq.document_id ? await docRepo.findOneBy({ id: rq.document_id }) : null;
      if (!doc) {
        doc = await docRepo.save(
          docRepo.create({
            type: 'RATE_REQUEST',
            status: 'DRAFT',
            businessProfileId: profile?.id ?? null,
            weddingId: rq.wedding_id,
            operatorId: rq.operator_id,
            rateRequestId: rq.id,
            partnerId: null,
            quoteId: null,
            invoiceId: null,
            legId: null,
            createdBy: userId,
          }),
        );
        await m.query(`UPDATE rate_request SET document_id = $2 WHERE id = $1`, [rq.id, doc.id]);
      }
      const [{ n }] = await m.query(
        `SELECT coalesce(max(version), 0)::int AS n FROM document_version WHERE document_id = $1`,
        [doc.id],
      );
      const verRepo = m.getRepository(DocumentVersion);
      await verRepo.save(
        verRepo.create({
          documentId: doc.id,
          version: n + 1,
          templateVersionId: null,
          pdfFileId: file.id,
          signedFileId: null,
          watermark: false,
          audience: 'OUTWARD',
          missingFields: [],
          createdBy: userId,
        }),
      );
      return { documentId: doc.id, version: n + 1 };
    });
  }
}
