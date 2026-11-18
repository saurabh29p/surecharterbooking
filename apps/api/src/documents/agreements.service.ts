import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  AGREEMENT_LABELS,
  DRAFT_WATERMARK,
  formatBps,
  formatINR,
  LIVE_QUOTE_STATUSES,
  numberInWordsIndian,
  rupeesInWords,
  toIstDate,
  type AgreementKind,
  type CancellationSchedule,
  type OutwardQuote,
} from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { BusinessProfilesService } from '../business-profiles/business-profiles.service.js';
import { FilesService } from '../files/files.service.js';
import { PdfService } from '../pdf/pdf.service.js';
import { Quote } from '../quotes/quote.entities.js';
import { QuoteDocumentsService } from '../quotes/quote-documents.service.js';
import { QuotesService } from '../quotes/quotes.service.js';
import { agreementHtml } from './agreement-render.js';
import { itineraryTable, paymentTable, scheduleTable } from './blocks.js';
import { DocumentRecord, DocumentVersion } from './document.entities.js';
import type { PlaceholderValues } from './markdown.js';
import { TemplatesService } from './templates.service.js';

export interface AgreementSubject {
  operatorId?: string;
  weddingId?: string;
  partnerId?: string;
}

/** "18 November 2026" (agreements spell the month out). */
export function longDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00+05:30`) : value;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');

/**
 * Makes agreements from the current template and real records (BRIEF.md §5.5): operator
 * agreements, client terms (from the accepted or live quote's client-safe snapshot) and partner
 * referral agreements. Each one is a new version of that subject's document, stored as a PDF.
 * Until the template is lawyer-approved the PDF says "DRAFT – NOT FOR SIGNATURE".
 */
@Injectable()
export class AgreementsService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly templates: TemplatesService,
    private readonly profiles: BusinessProfilesService,
    private readonly pdf: PdfService,
    private readonly files: FilesService,
    private readonly quoteDocs: QuoteDocumentsService,
    private readonly quotes: QuotesService,
  ) {}

  // ---------- Values for the placeholders ----------

  private async common(m: EntityManager, profileId: string | null) {
    const profile = profileId
      ? await this.profiles.get(profileId)
      : await this.profiles.getDefault();
    if (!profile) throw new ConflictException('Add your business profile in Settings first.');
    return {
      profile,
      text: {
        date: longDate(this.now()),
        place: profile.arbitrationSeatCity,
        'us.brand': profile.brandName ?? 'ShubhJets',
        'us.legal_name': profile.legalName,
        'us.llpin': profile.llpin,
        'us.gstin': profile.gstin,
        'us.address': profile.registeredAddress,
        'us.signatory_name': profile.signatoryName,
        'us.signatory_designation': profile.signatoryDesignation,
        'us.arbitration_city': profile.arbitrationSeatCity,
      } as Record<string, string | null>,
    };
  }

  /** The quote client terms are made from: the accepted one, else the live (sent or ready) one. */
  async quoteForTerms(m: EntityManager, weddingId: string): Promise<Quote | null> {
    const quotes = await m
      .getRepository(Quote)
      .find({ where: { weddingId }, order: { version: 'DESC' } });
    const now = this.now();
    return (
      quotes.find((q) => q.status === 'ACCEPTED') ??
      quotes.find(
        (q) => LIVE_QUOTE_STATUSES.includes(q.status) && (!q.validUntil || q.validUntil > now),
      ) ??
      null
    );
  }

  private async valuesFor(m: EntityManager, kind: AgreementKind, s: AgreementSubject) {
    if (kind === 'OPERATOR_AGREEMENT') {
      const [op] = await m.query(
        `SELECT id, legal_name, brand, cin, gstin, address, nsop_no, nsop_expires_on, cancellation_schedule
           FROM operator WHERE id = $1 AND deleted_at IS NULL`,
        [s.operatorId],
      );
      if (!op) throw new NotFoundException('Operator not found');
      const c = await this.common(m, null);
      const values: PlaceholderValues = {
        text: {
          ...c.text,
          'operator.legal_name': op.legal_name,
          'operator.brand': op.brand,
          'operator.cin': op.cin,
          'operator.gstin': op.gstin,
          'operator.address': op.address,
          'operator.nsop_no': op.nsop_no,
          'operator.nsop_valid_until': op.nsop_expires_on ? longDate(op.nsop_expires_on) : null,
        },
        blocks: {
          'operator.cancellation_table': scheduleTable(
            op.cancellation_schedule as CancellationSchedule | null,
          ),
        },
      };
      return {
        values,
        profile: c.profile,
        subjectName: (op.brand as string) ?? op.legal_name,
        link: { operatorId: op.id as string },
        quote: null,
        outward: null,
      };
    }
    if (kind === 'REFERRAL_AGREEMENT') {
      const [p] = await m.query(
        `SELECT id, firm, contact_person, address, city, gstin, commission_basis, commission_bps
           FROM partner WHERE id = $1 AND deleted_at IS NULL`,
        [s.partnerId],
      );
      if (!p) throw new NotFoundException('Partner not found');
      const c = await this.common(m, null);
      const bps = p.commission_bps as number;
      const pct =
        bps % 100 === 0
          ? `${formatBps(bps)} (${numberInWordsIndian(bps / 100).toLowerCase()} per cent)`
          : formatBps(bps);
      const values: PlaceholderValues = {
        text: {
          ...c.text,
          'partner.firm': p.firm,
          'partner.contact_person': p.contact_person,
          'partner.address': p.address,
          'partner.city': p.city,
          'partner.gstin': p.gstin ?? 'not registered',
          'partner.commission':
            p.commission_basis === 'MARGIN_SHARE'
              ? `${pct} of the Margin on each Booking`
              : `${pct} of the Booking Value of each Booking`,
        },
        blocks: {},
      };
      return {
        values,
        profile: c.profile,
        subjectName: p.firm as string,
        link: { partnerId: p.id as string },
        quote: null,
        outward: null,
      };
    }
    // CLIENT_TERMS
    const [w] = await m.query(
      `SELECT w.id, w.code, w.venue_city, w.starts_on, w.ends_on, w.business_profile_id,
              c.name, c.address, c.gstin, c.phone, c.email
         FROM wedding w LEFT JOIN client c ON c.id = w.client_id
        WHERE w.id = $1 AND w.deleted_at IS NULL`,
      [s.weddingId],
    );
    if (!w) throw new NotFoundException('Wedding not found');
    const quote = await this.quoteForTerms(m, w.id);
    if (!quote)
      throw new ConflictException(
        'Issue the quote first: the client terms list its flights, price and cancellation charges.',
      );
    // Quotes issued before snapshots existed are rebuilt from their lines (client-safe fields only).
    const o: OutwardQuote = quote.snapshot ?? (await this.quotes.outward(m, quote));
    const c = await this.common(m, quote.businessProfileId);
    const dates =
      w.starts_on && w.ends_on && w.starts_on !== w.ends_on
        ? `${longDate(w.starts_on)} to ${longDate(w.ends_on)}`
        : w.starts_on
          ? longDate(w.starts_on)
          : null;
    const list = (s2: string | null) =>
      s2
        ? s2
            .split(/\n+/)
            .map((x) => x.trim())
            .filter(Boolean)
            .join('; ')
        : null;
    const values: PlaceholderValues = {
      text: {
        ...c.text,
        'client.name': w.name,
        'client.address': w.address,
        'client.gstin': w.gstin ?? 'not registered',
        'client.phone': w.phone,
        'client.email': w.email,
        'wedding.code': w.code,
        'wedding.city': w.venue_city,
        'wedding.dates': dates,
        'quote.reference': o.reference,
        'quote.date': longDate(new Date(o.issuedAt)),
        'quote.total': formatINR(o.total),
        'quote.total_words': rupeesInWords(o.total),
        'quote.cancellation_note': o.cancellation.note ?? 'No further conditions.',
        'quote.inclusions': list(o.inclusions) ?? 'As listed in the quote.',
        'quote.exclusions': list(o.exclusions) ?? 'Anything not listed as included.',
      },
      blocks: {
        'quote.itinerary': itineraryTable(o),
        'quote.payment_schedule': paymentTable(o.payment),
        'quote.cancellation_table': scheduleTable(o.cancellation.schedule),
      },
    };
    return {
      values,
      profile: c.profile,
      subjectName: w.code as string,
      link: { weddingId: w.id as string, quoteId: quote.id },
      quote,
      outward: o,
    };
  }

  // ---------- Making the document ----------

  /** Makes a new version of the subject's agreement and stores its PDF. */
  async generate(kind: AgreementKind, subject: AgreementSubject, userId: string) {
    return this.ds.transaction(async (m) => {
      const v = await this.valuesFor(m, kind, subject);
      const template = await this.templates.current(kind, m);
      const docRepo = m.getRepository(DocumentRecord);
      const where =
        kind === 'OPERATOR_AGREEMENT'
          ? { type: kind, operatorId: v.link.operatorId }
          : kind === 'REFERRAL_AGREEMENT'
            ? { type: kind, partnerId: v.link.partnerId }
            : { type: kind, weddingId: v.link.weddingId };
      let doc = await docRepo.findOneBy(where as never);
      const [{ n }] = doc
        ? await m.query(
            `SELECT coalesce(max(version), 0)::int AS n FROM document_version WHERE document_id = $1`,
            [doc.id],
          )
        : [{ n: 0 }];
      const version = n + 1;

      const { html, missing } = agreementHtml({
        kind,
        body: template.bodyMd,
        values: v.values,
        brandName: v.profile.brandName ?? 'ShubhJets',
        subtitle: `${v.subjectName} · Version ${version}`,
        watermark: template.lawyerApproved ? null : DRAFT_WATERMARK,
      });
      // A lawyer-approved agreement is for signature: it must be complete.
      if (template.lawyerApproved && missing.length)
        throw new ConflictException({
          code: 'MISSING_FIELDS',
          message: `Fill these in first: ${missing.join(', ')}.`,
          missing,
        });

      const footer = [
        v.profile.legalName
          ? `${v.profile.brandName ?? 'ShubhJets'} is a service of ${v.profile.legalName}`
          : (v.profile.brandName ?? 'ShubhJets'),
        v.profile.llpin ? `LLPIN ${v.profile.llpin}` : null,
        v.profile.gstin ? `GSTIN ${v.profile.gstin}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const { pdf, text } = await this.pdf.renderWithText(html, { footer });
      // Client terms go to the client: rule 4 scan against the quote's internal figures.
      if (v.quote && v.outward)
        await this.quoteDocs.assertNoLeaks(m, v.quote, v.outward, text, pdf, 'client terms');

      const short = {
        OPERATOR_AGREEMENT: 'Operator-Agreement',
        CLIENT_TERMS: 'Client-Terms',
        REFERRAL_AGREEMENT: 'Referral-Agreement',
      }[kind];
      const file = await this.files.upload(
        {
          buffer: pdf,
          originalName: `${safe(v.profile.brandName ?? 'ShubhJets')}-${short}-${safe(v.subjectName)}-v${version}.pdf`,
          purpose: 'document',
        },
        m,
      );
      if (!doc) {
        doc = await docRepo.save(
          docRepo.create({
            type: kind,
            status: 'DRAFT',
            businessProfileId: v.profile.id,
            weddingId: v.link.weddingId ?? null,
            operatorId: v.link.operatorId ?? null,
            partnerId: v.link.partnerId ?? null,
            quoteId: v.link.quoteId ?? null,
            legId: null,
            invoiceId: null,
            rateRequestId: null,
            createdBy: userId,
          }),
        );
      } else {
        // A new version is not signed yet, whatever the old one was.
        doc.status = 'DRAFT';
        doc.quoteId = v.link.quoteId ?? doc.quoteId;
        await docRepo.save(doc);
      }
      const verRepo = m.getRepository(DocumentVersion);
      await verRepo.save(
        verRepo.create({
          documentId: doc.id,
          version,
          templateVersionId: template.id,
          pdfFileId: file.id,
          signedFileId: null,
          watermark: !template.lawyerApproved,
          audience: 'OUTWARD',
          missingFields: missing,
          createdBy: userId,
        }),
      );
      return { documentId: doc.id, version, missing, draft: !template.lawyerApproved };
    });
  }

  label(kind: AgreementKind) {
    return AGREEMENT_LABELS[kind];
  }

  today() {
    return toIstDate(this.now());
  }
}
