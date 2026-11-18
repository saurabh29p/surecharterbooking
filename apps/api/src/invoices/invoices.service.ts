import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  financialYear,
  formatInvoiceNumber,
  GST_KEYS,
  toIstDate,
  type IsoDate,
  type OutwardQuote,
} from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { BusinessProfilesService } from '../business-profiles/business-profiles.service.js';
import { DocumentRecord, DocumentVersion } from '../documents/document.entities.js';
import { FilesService } from '../files/files.service.js';
import { PdfService } from '../pdf/pdf.service.js';
import { Quote } from '../quotes/quote.entities.js';
import { QuoteDocumentsService } from '../quotes/quote-documents.service.js';
import { QuotesService } from '../quotes/quotes.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Invoice } from './invoice.entity.js';
import { renderInvoiceHtml } from './invoice-template.js';

const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');

/**
 * GST tax invoices (BRIEF.md §5.5, rule 5): full-value invoices from the accepted quote, numbered
 * per business profile and financial year (SJ/2026-27/0001, restarting each 1 April). Blocked until
 * the profile has its GSTIN and address, the CA has confirmed the GST rate and SAC code, and the
 * client's billing address is known. Numbers are never reused; a mistake is cancelled, not deleted.
 */
@Injectable()
export class InvoicesService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly profiles: BusinessProfilesService,
    private readonly quotes: QuotesService,
    private readonly quoteDocs: QuoteDocumentsService,
    private readonly pdf: PdfService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  private async acceptedQuote(m: EntityManager, weddingId: string): Promise<Quote | null> {
    return m
      .getRepository(Quote)
      .findOne({ where: { weddingId, status: 'ACCEPTED' }, order: { version: 'DESC' } });
  }

  /** What stops an invoice being issued for this wedding, in plain words (empty = ready). */
  async blockers(weddingId: string, m: EntityManager = this.ds.manager): Promise<string[]> {
    const [w] = await m.query(
      `SELECT w.id, w.business_profile_id, c.name, c.address FROM wedding w
         LEFT JOIN client c ON c.id = w.client_id WHERE w.id = $1 AND w.deleted_at IS NULL`,
      [weddingId],
    );
    if (!w) throw new NotFoundException('Wedding not found');
    const out: string[] = [];
    const q = await this.acceptedQuote(m, weddingId);
    if (!q) out.push('The client has not accepted a quote yet');
    const profile = q
      ? await this.profiles.get(q.businessProfileId)
      : w.business_profile_id
        ? await this.profiles.get(w.business_profile_id)
        : await this.profiles.getDefault();
    if (!profile) out.push('Add your business profile in Settings');
    else out.push(...profile.readiness.invoiceBlockers);
    const view = await this.settings.view();
    if (view.settings.some((s) => (GST_KEYS as readonly string[]).includes(s.key) && !s.confirmed))
      out.push('Your CA has not confirmed the GST rate and SAC code yet (Settings → Rules)');
    if ((await this.settings.get<string>('invoicing.model')) !== 'FULL_VALUE')
      out.push(
        'Fee-only invoices are not available yet; switch invoicing to full value in Settings',
      );
    if (!w.name) out.push('Link the client to this wedding');
    else if (!w.address?.trim()) out.push("Add the client's billing address (Partners → Clients)");
    if (q) {
      const [live] = await m.query(
        `SELECT number FROM invoice WHERE quote_id = $1 AND cancelled_at IS NULL`,
        [q.id],
      );
      if (live) out.push(`Already invoiced: ${live.number}. Cancel it first to issue a new one.`);
    }
    return out;
  }

  async list(weddingId: string) {
    const rows = await this.ds
      .getRepository(Invoice)
      .find({ where: { weddingId }, order: { createdAt: 'DESC' } });
    return {
      blockers: await this.blockers(weddingId),
      invoices: rows.map((i) => ({
        id: i.id,
        number: i.number,
        issuedOn: i.issuedOn,
        buyerName: i.buyerName,
        total: i.total,
        documentId: i.documentId,
        cancelledAt: i.cancelledAt,
        cancelReason: i.cancelReason,
      })),
    };
  }

  /** Issues the invoice for the accepted quote. All or nothing: number, PDF, records. */
  async issue(weddingId: string, userId: string, issuedOn?: IsoDate) {
    return this.ds.transaction(async (m) => {
      const blockers = await this.blockers(weddingId, m);
      if (blockers.length)
        throw new ConflictException({ code: 'INVOICE_BLOCKED', message: blockers[0], blockers });
      const q = (await this.acceptedQuote(m, weddingId))!;
      const date = issuedOn ?? toIstDate(this.now());
      if (date > toIstDate(this.now()))
        throw new ConflictException('An invoice cannot be dated in the future');

      // Numbering: lock the profile so two invoices can't take the same number.
      const [p] = await m.query(
        `SELECT id, invoice_prefix, legal_name, registered_address, gstin, llpin, state_code,
                brand_name, signatory_name, signatory_designation
           FROM business_profile WHERE id = $1 FOR UPDATE`,
        [q.businessProfileId],
      );
      const fy = financialYear(date);
      const [{ seq }] = await m.query(
        `SELECT coalesce(max(seq), 0)::int + 1 AS seq FROM invoice WHERE business_profile_id = $1 AND fy = $2`,
        [p.id, fy],
      );
      const number = formatInvoiceNumber(p.invoice_prefix, date, seq);

      const [w] = await m.query(
        `SELECT c.name, c.address, c.gstin FROM wedding w JOIN client c ON c.id = w.client_id WHERE w.id = $1`,
        [weddingId],
      );
      const outward: OutwardQuote = await this.quoteDocs.complete(
        m,
        q.snapshot ?? (await this.quotes.outward(m, q)),
        q.businessProfileId,
      );
      const placeOfSupply =
        q.placeOfSupplyState ?? (w.gstin ? String(w.gstin).slice(0, 2) : p.state_code);
      const html = renderInvoiceHtml({
        number,
        issuedOn: date,
        supplier: {
          brandName: p.brand_name ?? 'ShubhJets',
          legalName: p.legal_name,
          address: p.registered_address,
          gstin: p.gstin,
          llpin: p.llpin,
          stateCode: p.state_code,
          signatoryName: p.signatory_name,
          signatoryDesignation: p.signatory_designation,
        },
        buyer: { name: w.name, address: w.address, gstin: w.gstin },
        placeOfSupplyState: placeOfSupply,
        sac: q.gstSac ?? (await this.settings.get<string>('gst.sac')),
        quote: outward,
        logo: outward.business.logo,
      });
      const { pdf, text } = await this.pdf.renderWithText(html, {
        footer: `${p.legal_name} · GSTIN ${p.gstin} · Invoice ${number}`,
      });
      // Rule 4: prices only, never the operator's rate or our margin.
      await this.quoteDocs.assertNoLeaks(m, q, outward, text, pdf, 'invoice');

      const repo = m.getRepository(Invoice);
      const invoice = await repo.save(
        repo.create({
          weddingId,
          businessProfileId: p.id,
          quoteId: q.id,
          fy,
          seq,
          number,
          issuedOn: date,
          buyerName: w.name,
          buyerGstin: w.gstin,
          placeOfSupplyState: placeOfSupply,
          taxable: outward.subtotal,
          cgst: outward.gst.cgst,
          sgst: outward.gst.sgst,
          igst: outward.gst.igst,
          total: outward.total,
          documentId: null,
          cancelledAt: null,
          cancelReason: null,
          createdBy: userId,
        }),
      );
      const file = await this.files.upload(
        {
          buffer: pdf,
          originalName: `${safe(p.brand_name ?? 'ShubhJets')}-Invoice-${safe(number)}.pdf`,
          purpose: 'document',
        },
        m,
      );
      const docRepo = m.getRepository(DocumentRecord);
      const doc = await docRepo.save(
        docRepo.create({
          type: 'INVOICE',
          status: 'DRAFT',
          businessProfileId: p.id,
          weddingId,
          quoteId: q.id,
          invoiceId: invoice.id,
          operatorId: null,
          partnerId: null,
          rateRequestId: null,
          legId: null,
          createdBy: userId,
        }),
      );
      await m.getRepository(DocumentVersion).save(
        m.getRepository(DocumentVersion).create({
          documentId: doc.id,
          version: 1,
          templateVersionId: null,
          pdfFileId: file.id,
          signedFileId: null,
          watermark: false,
          audience: 'OUTWARD',
          missingFields: [],
          createdBy: userId,
        }),
      );
      invoice.documentId = doc.id;
      await repo.save(invoice);
      return { id: invoice.id, number, documentId: doc.id, total: invoice.total };
    });
  }

  /** Cancels an invoice (its number is never reused). A new one can then be issued. */
  async cancel(id: string, reason: string) {
    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(Invoice);
      const inv = await repo.findOneBy({ id });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (inv.cancelledAt) throw new ConflictException('This invoice is already cancelled');
      inv.cancelledAt = this.now();
      inv.cancelReason = reason;
      await repo.save(inv);
    });
  }
}
