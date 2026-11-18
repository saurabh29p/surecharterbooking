import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  describeLeaks,
  findLeaks,
  type BankDetails,
  type LeakFinding,
  type LeakScanInput,
  type OutwardQuote,
} from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { BusinessProfile } from '../business-profiles/business-profile.entity.js';
import { EncryptionService } from '../crypto/encryption.service.js';
import { FilesService } from '../files/files.service.js';
import { PdfService } from '../pdf/pdf.service.js';
import type { Quote } from './quote.entities.js';
import { quoteFooter, renderQuoteHtml } from './quote-template.js';
import { QuotesService } from './quotes.service.js';

export type ShareChannel =
  | 'WEB_SHARE'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'EMAIL'
  | 'INSTAGRAM'
  | 'MESSENGER'
  | 'COPY_LINK'
  | 'DOWNLOAD';

export interface QuotePdf {
  bytes: Buffer;
  filename: string;
}

/**
 * The quote as a document: the branded PDF made when a quote is issued, stored with its
 * document record, and the shares logged against it. Every PDF is scanned before it is stored
 * or shown: its text must contain no operator net rate, cost, margin, markup, commission or
 * operator bank detail (hard rule 4). If anything is found, nothing is issued.
 */
@Injectable()
export class QuoteDocumentsService {
  private readonly log = new Logger(QuoteDocumentsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly quotes: QuotesService,
    private readonly pdf: PdfService,
    private readonly files: FilesService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  /** Our bank details and logo, added at render time (never stored in the snapshot). */
  private async complete(m: EntityManager, outward: OutwardQuote, profileId: string) {
    const p = await m.getRepository(BusinessProfile).findOneBy({ id: profileId });
    let bank: OutwardQuote['bank'] = null;
    if (p?.bankDetailsEnc) {
      const b = this.crypto.decryptJson<BankDetails>(p.bankDetailsEnc);
      bank = {
        accountName: b.accountName,
        accountNumber: b.accountNumber,
        ifsc: b.ifsc,
        bankName: b.bankName,
        branch: b.branch ?? null,
      };
    }
    let logo: string | null = null;
    if (p?.logoFileId) {
      const { file, bytes } = await this.files.read(p.logoFileId).catch(() => ({
        file: null,
        bytes: null,
      }));
      if (file && bytes) logo = `data:${file.mime};base64,${bytes.toString('base64')}`;
    }
    return { ...outward, bank, business: { ...outward.business, logo } };
  }

  /** Everything the scan must not find, and the figures the quote legitimately shows. */
  private async scanInput(m: EntityManager, q: Quote, o: OutwardQuote): Promise<LeakScanInput> {
    const figures = await this.quotes.internalFigures(m, q);
    const ours = new Set(
      [o.bank?.accountNumber, o.bank?.ifsc].filter(Boolean).map((x) => x!.replace(/\s/g, '')),
    );
    const texts: { label: string; value: string }[] = [];
    const ops: { name: string; bank_details_enc: Buffer | null }[] = figures.operatorIds.length
      ? await m.query(
          `SELECT coalesce(brand, legal_name) AS name, bank_details_enc FROM operator WHERE id = ANY($1)`,
          [figures.operatorIds],
        )
      : [];
    for (const op of ops) {
      if (!op.bank_details_enc) continue;
      const b = this.crypto.decryptJson<BankDetails>(op.bank_details_enc);
      for (const [label, value] of [
        [`${op.name} bank account number`, b.accountNumber],
        [`${op.name} IFSC`, b.ifsc],
      ] as const) {
        // Same branch as our own account: our IFSC is printed for payment and can't be told apart.
        if (value && !ours.has(value.replace(/\s/g, ''))) texts.push({ label, value });
      }
    }
    const allowedAmounts = [
      o.subtotal,
      o.total,
      o.gst.cgst,
      o.gst.sgst,
      o.gst.igst,
      o.gst.total,
      ...o.legs.flatMap((l) => [l.price, ...l.lines.map((x) => x.price)]),
      ...o.extras.map((e) => e.price),
      ...o.payment.map((p) => p.amount),
    ];
    const allowedPercents = [
      o.gst.rateBps,
      o.gst.rateBps / 2,
      ...o.cancellation.schedule.map((t) => t.chargeBps),
      ...o.payment.map((p) => p.bps),
    ];
    return {
      amounts: figures.amounts,
      percents: figures.percents,
      texts,
      allowedAmounts,
      allowedPercents,
    };
  }

  /** Renders the quote and scans both the page text and the text inside the PDF. */
  private async renderChecked(m: EntityManager, q: Quote, o: OutwardQuote): Promise<Buffer> {
    const { pdf, text } = await this.pdf.renderWithText(renderQuoteHtml(o), {
      footer: quoteFooter(o),
    });
    const input = await this.scanInput(m, q, o);
    const pdfText = await this.pdf.text(pdf);
    const seen = new Set<string>();
    const findings: LeakFinding[] = [
      ...findLeaks(text, input),
      ...findLeaks(pdfText, input),
    ].filter((f) => !seen.has(f.label) && seen.add(f.label));
    if (findings.length) {
      this.log.error(
        `Quote ${q.id}: PDF blocked, internal figures found: ${describeLeaks(findings)}`,
      );
      throw new ConflictException({
        code: 'LEAK_BLOCKED',
        message: `Stopped: the quote PDF would show internal figures (${describeLeaks(findings)}). Nothing was issued or sent. Remove them from the quote text and try again.`,
        findings,
      });
    }
    return pdf;
  }

  private filename(o: OutwardQuote): string {
    const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    return `${safe(o.business.brandName)}-Quote-${safe(o.reference.replace(' · ', '-'))}.pdf`;
  }

  /** Issue a draft: freeze it, make the branded PDF, scan it, store it. All or nothing. */
  async issue(id: string, confirmLooser: boolean) {
    await this.ds.transaction(async (m) => {
      const { quote, outward } = await this.quotes.issue(m, id, confirmLooser);
      const full = await this.complete(m, outward, quote.businessProfileId);
      const pdf = await this.renderChecked(m, quote, full);
      const file = await this.files.upload(
        { buffer: pdf, originalName: this.filename(full), purpose: 'document' },
        m,
      );
      const [doc] = await m.query(
        `INSERT INTO document (type, status, business_profile_id, wedding_id, quote_id, created_by)
         VALUES ('QUOTE', 'DRAFT', $1, $2, $3, $4) RETURNING id`,
        [quote.businessProfileId, quote.weddingId, quote.id, quote.createdBy],
      );
      await m.query(
        `INSERT INTO document_version (document_id, version, pdf_file_id, watermark, audience, created_by)
         VALUES ($1, 1, $2, false, 'OUTWARD', $3)`,
        [doc.id, file.id, quote.createdBy],
      );
    });
    return this.quotes.get(id);
  }

  /** An unsaved preview of a draft (watermarked), checked the same way. */
  async preview(id: string): Promise<QuotePdf> {
    const m = this.ds.manager;
    const q = await this.quotes.find(id);
    if (q.status !== 'DRAFT') return this.stored(id);
    const outward = await this.complete(m, await this.quotes.outward(m, q), q.businessProfileId);
    return { bytes: await this.renderChecked(m, q, outward), filename: this.filename(outward) };
  }

  private async version(m: EntityManager, quoteId: string) {
    const [v] = await m.query(
      `SELECT dv.id, dv.pdf_file_id, d.id AS document_id FROM document d
         JOIN document_version dv ON dv.document_id = d.id
        WHERE d.quote_id = $1 AND d.type = 'QUOTE' ORDER BY dv.version DESC LIMIT 1`,
      [quoteId],
    );
    return v as { id: string; pdf_file_id: string; document_id: string } | undefined;
  }

  /** The issued quote's stored PDF, exactly as it was made. */
  async stored(id: string): Promise<QuotePdf> {
    const q = await this.quotes.find(id);
    const v = await this.version(this.ds.manager, id);
    if (!v) throw new NotFoundException('This quote has no PDF yet. Issue it first.');
    const { file, bytes } = await this.files.read(v.pdf_file_id);
    return { bytes, filename: file.originalName ?? `Quote-${q.version}.pdf` };
  }

  /** You sent it yourself; logged on the document with the channel and recipient. */
  async markSent(id: string, channel: ShareChannel, recipient: string | null) {
    await this.ds.transaction(async (m) => {
      const q = await this.quotes.markSent(m, id);
      const v = await this.version(m, id);
      if (!v) throw new NotFoundException('This quote has no PDF yet. Issue it first.');
      const [share] = await m.query(
        `INSERT INTO share (document_version_id, channel, recipient, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [v.id, channel, recipient, q.createdBy],
      );
      await m.query(`UPDATE document SET status = 'SHARED', updated_at = now() WHERE id = $1`, [
        v.document_id,
      ]);
      await this.audit.record(
        {
          entity: 'quote',
          entityId: id,
          action: 'SHARED',
          diff: { channel, recipient, shareId: share.id },
        },
        m,
      );
    });
    return this.quotes.get(id);
  }

  async shares(id: string) {
    return this.ds.query(
      `SELECT s.id, s.channel, s.recipient, s.shared_at AS "sharedAt" FROM share s
         JOIN document_version dv ON dv.id = s.document_version_id
         JOIN document d ON d.id = dv.document_id
        WHERE d.quote_id = $1 ORDER BY s.shared_at DESC`,
      [id],
    );
  }
}
