import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DOCUMENT_TYPE_LABELS,
  formatDateTime,
  formatINR,
  LIVE_QUOTE_STATUSES,
  linkState,
  mailtoUrl,
  shareMessage,
  shareSubject,
  telegramUrl,
  whatsappUrl,
  type DocumentType,
  type OutwardQuote,
  type ShareChannel,
} from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { FilesService } from '../files/files.service.js';
import { Quote } from '../quotes/quote.entities.js';
import { QuotesService } from '../quotes/quotes.service.js';
import { SettingsService } from '../settings/settings.service.js';

export const LINK_PLACEHOLDER = '{link}';

interface DocInfo {
  id: string;
  type: DocumentType;
  status: string;
  versionId: string;
  pdfFileId: string | null;
  weddingId: string | null;
  quoteId: string | null;
  invoiceNumber: string | null;
  weddingCode: string | null;
  city: string | null;
  brand: string;
  legalName: string | null;
  gstin: string | null;
  recipient: { name: string | null; phone: string | null; email: string | null };
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Secure share links (BRIEF.md §5.6): a random token per share (only its hash is stored), expiring
 * after N days (Settings) and revocable. The link page shows the document; for quotes it has an
 * "I accept" button that records name and time for you to confirm in the desk. Every share is
 * logged with channel, recipient, time and openings.
 */
@Injectable()
export class SharingService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly quotes: QuotesService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  private base(): string {
    return (this.config.PUBLIC_BASE_URL ?? this.config.DESK_ORIGIN).replace(/\/$/, '');
  }

  /** The document, its latest version and who it usually goes to. */
  async info(documentId: string, m: EntityManager = this.ds.manager): Promise<DocInfo> {
    const [d] = await m.query(
      `SELECT d.id, d.type, d.status, d.wedding_id, d.quote_id, d.operator_id, d.partner_id,
              dv.id AS version_id, dv.pdf_file_id, i.number AS invoice_number,
              w.code, w.venue_city, bp.brand_name, bp.legal_name, bp.gstin,
              c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
              p.contact_person, p.firm, p.phone AS partner_phone, p.email AS partner_email,
              coalesce(o.brand, o.legal_name) AS op_name,
              (SELECT oc.phone FROM operator_contact oc WHERE oc.operator_id = d.operator_id ORDER BY oc.is_primary DESC, oc.created_at LIMIT 1) AS op_phone,
              (SELECT oc.email FROM operator_contact oc WHERE oc.operator_id = d.operator_id ORDER BY oc.is_primary DESC, oc.created_at LIMIT 1) AS op_email,
              wp.contact_person AS w_contact, wp.firm AS w_firm, wp.phone AS w_phone, wp.email AS w_email
         FROM document d
         JOIN LATERAL (SELECT id, pdf_file_id FROM document_version WHERE document_id = d.id ORDER BY version DESC LIMIT 1) dv ON true
         LEFT JOIN invoice i ON i.id = d.invoice_id
         LEFT JOIN wedding w ON w.id = d.wedding_id
         LEFT JOIN business_profile bp ON bp.id = coalesce(d.business_profile_id, w.business_profile_id)
         LEFT JOIN client c ON c.id = w.client_id
         LEFT JOIN partner wp ON wp.id = w.partner_id
         LEFT JOIN partner p ON p.id = d.partner_id
         LEFT JOIN operator o ON o.id = d.operator_id
        WHERE d.id = $1`,
      [documentId],
    );
    if (!d) throw new NotFoundException('Document not found');
    const type = d.type as DocumentType;
    // Quotes, terms and invoices go to the client (or the planner who brought them).
    const recipient =
      type === 'RATE_REQUEST' || type === 'OPERATOR_AGREEMENT'
        ? { name: d.op_name, phone: d.op_phone, email: d.op_email }
        : type === 'REFERRAL_AGREEMENT'
          ? { name: d.contact_person ?? d.firm, phone: d.partner_phone, email: d.partner_email }
          : d.client_phone || d.client_email || !d.w_firm
            ? { name: d.client_name, phone: d.client_phone, email: d.client_email }
            : { name: d.w_contact ?? d.w_firm, phone: d.w_phone, email: d.w_email };
    return {
      id: d.id,
      type,
      status: d.status,
      versionId: d.version_id,
      pdfFileId: d.pdf_file_id,
      weddingId: d.wedding_id,
      quoteId: d.quote_id,
      invoiceNumber: d.invoice_number,
      weddingCode: d.code,
      city: d.venue_city,
      brand: d.brand_name ?? 'ShubhJets',
      legalName: d.legal_name,
      gstin: d.gstin,
      recipient: {
        name: recipient.name ? String(recipient.name).split(' ')[0]! : null,
        phone: recipient.phone ?? null,
        email: recipient.email ?? null,
      },
    };
  }

  private async quoteOf(m: EntityManager, info: DocInfo): Promise<Quote | null> {
    return info.quoteId ? m.getRepository(Quote).findOneBy({ id: info.quoteId }) : null;
  }

  /** The message (with a {link} placeholder), subject and usual recipient, before a link exists. */
  async prepare(documentId: string) {
    const m = this.ds.manager;
    const info = await this.info(documentId, m);
    const q = info.type === 'QUOTE' ? await this.quoteOf(m, info) : null;
    const ctx = {
      type: info.type,
      recipientName: info.recipient.name,
      brand: info.brand,
      weddingCode: info.weddingCode,
      city: info.city,
      reference: q?.snapshot?.reference ?? info.invoiceNumber ?? info.weddingCode,
      total: q?.snapshot ? formatINR(q.snapshot.total) : null,
      validUntil: q?.validUntil ? formatDateTime(q.validUntil) : null,
      link: LINK_PLACEHOLDER,
    };
    return {
      title: DOCUMENT_TYPE_LABELS[info.type],
      message: shareMessage(ctx),
      subject: shareSubject(ctx),
      recipient: info.recipient,
      expiryDays: await this.settings.get<number>('share.link_expiry_days'),
    };
  }

  /** Makes a secure link for one share, logs it, and returns the message and channel links. */
  async createLink(
    documentId: string,
    input: {
      channel: ShareChannel;
      recipient?: string | null;
      phone?: string | null;
      email?: string | null;
      message?: string | null;
      subject?: string | null;
    },
    userId: string,
  ) {
    return this.ds.transaction(async (m) => {
      const info = await this.info(documentId, m);
      if (!info.pdfFileId) throw new ConflictException('This document has no PDF yet.');
      const prep = await this.prepare(documentId);
      const template = input.message?.trim() || prep.message;
      if (!template.includes(LINK_PLACEHOLDER))
        throw new BadRequestException({
          message: `Keep ${LINK_PLACEHOLDER} in the message: it is replaced by the secure link`,
          fields: { message: `Keep ${LINK_PLACEHOLDER} in the message` },
        });
      const token = randomBytes(24).toString('base64url');
      const url = `${this.base()}/s/${token}`;
      const message = template.split(LINK_PLACEHOLDER).join(url);
      const days = await this.settings.get<number>('share.link_expiry_days');
      const expiresAt = new Date(this.now().getTime() + days * 86_400_000);
      const [share] = await m.query(
        `INSERT INTO share (document_version_id, channel, recipient, message_text, token_hash, expires_at, shared_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          info.versionId,
          input.channel,
          input.recipient ?? null,
          message,
          hashToken(token),
          expiresAt,
          this.now(),
          userId,
        ],
      );
      await this.markShared(m, info, userId);
      await this.audit.record(
        {
          entity: 'document',
          entityId: documentId,
          action: 'SHARED',
          diff: {
            channel: input.channel,
            recipient: input.recipient ?? null,
            shareId: share.id,
            link: true,
          },
        },
        m,
      );
      const subject = input.subject?.trim() || prep.subject;
      return {
        shareId: share.id as string,
        url,
        expiresAt,
        message,
        subject,
        whatsappUrl: whatsappUrl(message, input.phone ?? prep.recipient.phone),
        telegramUrl: telegramUrl(url, message),
        mailtoUrl: mailtoUrl(input.email ?? prep.recipient.email, subject, message),
      };
    });
  }

  /** A document that has gone out: quotes become "Sent", other documents too. */
  private async markShared(m: EntityManager, info: DocInfo, userId: string) {
    if (info.type === 'QUOTE' && info.quoteId) {
      const q = await m.getRepository(Quote).findOneBy({ id: info.quoteId });
      if (q && LIVE_QUOTE_STATUSES.includes(q.status)) await this.quotes.markSent(m, q.id);
    }
    if (info.status === 'DRAFT')
      await m.query(`UPDATE document SET status = 'SHARED', updated_at = now() WHERE id = $1`, [
        info.id,
      ]);
    void userId;
  }

  /** Shares of a document, newest first, with link state and openings. */
  async list(documentId: string) {
    await this.info(documentId);
    const rows: Record<string, unknown>[] = await this.ds.query(
      `SELECT s.id, s.channel, s.recipient, s.shared_at, s.expires_at, s.revoked_at, s.first_opened_at,
              s.last_opened_at, s.open_count, s.token_hash IS NOT NULL AS has_link, dv.version,
              (SELECT json_build_object('name', a.name, 'at', a.accepted_at) FROM share_acceptance a
                WHERE a.share_id = s.id ORDER BY a.accepted_at DESC LIMIT 1) AS acceptance
         FROM share s JOIN document_version dv ON dv.id = s.document_version_id
        WHERE dv.document_id = $1 ORDER BY s.shared_at DESC`,
      [documentId],
    );
    const now = this.now();
    return rows.map((r) => ({
      id: r.id as string,
      version: r.version as number,
      channel: r.channel as ShareChannel,
      recipient: r.recipient as string | null,
      sharedAt: r.shared_at as Date,
      link: r.has_link
        ? {
            state: linkState(
              { expiresAt: r.expires_at as Date, revokedAt: r.revoked_at as Date },
              now,
            ),
            expiresAt: r.expires_at as Date,
          }
        : null,
      opened: {
        count: r.open_count as number,
        first: r.first_opened_at as Date | null,
        last: r.last_opened_at as Date | null,
      },
      acceptance: r.acceptance as { name: string; at: string } | null,
    }));
  }

  async revoke(shareId: string) {
    await this.ds.transaction(async (m) => {
      const [s] = await m.query(
        `SELECT s.id, dv.document_id FROM share s JOIN document_version dv ON dv.id = s.document_version_id WHERE s.id = $1`,
        [shareId],
      );
      if (!s) throw new NotFoundException('Share not found');
      await m.query(`UPDATE share SET revoked_at = coalesce(revoked_at, $2) WHERE id = $1`, [
        shareId,
        this.now(),
      ]);
      await this.audit.record(
        { entity: 'document', entityId: s.document_id, action: 'LINK_REVOKED', diff: { shareId } },
        m,
      );
    });
  }

  // ---------- The public side ----------

  /** Finds a share by its token; null when unknown. */
  private async byToken(m: EntityManager, token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
    const [s] = await m.query(
      `SELECT s.id, s.expires_at, s.revoked_at, dv.document_id FROM share s
         JOIN document_version dv ON dv.id = s.document_version_id WHERE s.token_hash = $1`,
      [hashToken(token)],
    );
    return (
      (s as
        | { id: string; expires_at: Date | null; revoked_at: Date | null; document_id: string }
        | undefined) ?? null
    );
  }

  /** What the public page shows. Counts the opening. */
  async open(token: string, opts: { count: boolean } = { count: true }) {
    const m = this.ds.manager;
    const s = await this.byToken(m, token);
    if (!s) return { state: 'UNKNOWN' as const, brand: 'ShubhJets' };
    const info = await this.info(s.document_id, m);
    const state = linkState({ expiresAt: s.expires_at, revokedAt: s.revoked_at }, this.now());
    if (state !== 'ACTIVE') return { state, brand: info.brand };
    if (opts.count)
      await m.query(
        `UPDATE share SET open_count = open_count + 1, first_opened_at = coalesce(first_opened_at, $2), last_opened_at = $2 WHERE id = $1`,
        [s.id, this.now()],
      );
    const q = info.type === 'QUOTE' ? await this.quoteOf(m, info) : null;
    const quote: OutwardQuote | null = q ? (q.snapshot ?? null) : null;
    const quoteState = q
      ? q.status === 'ACCEPTED'
        ? ('ACCEPTED' as const)
        : q.status === 'SUPERSEDED'
          ? ('REPLACED' as const)
          : LIVE_QUOTE_STATUSES.includes(q.status) && (!q.validUntil || q.validUntil > this.now())
            ? ('LIVE' as const)
            : ('EXPIRED' as const)
      : null;
    const [acc] = await m.query(
      `SELECT name, accepted_at FROM share_acceptance WHERE share_id = $1 ORDER BY accepted_at DESC LIMIT 1`,
      [s.id],
    );
    return {
      state: 'ACTIVE' as const,
      shareId: s.id,
      brand: info.brand,
      legalLine:
        [
          info.legalName ? `${info.brand} is a service of ${info.legalName}` : null,
          info.gstin ? `GSTIN ${info.gstin}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      title: DOCUMENT_TYPE_LABELS[info.type],
      reference: info.invoiceNumber ?? info.weddingCode,
      quote,
      quoteState,
      accepted: acc ? { name: acc.name as string, at: new Date(acc.accepted_at) } : null,
      linkExpiresAt: s.expires_at,
      pdfFileId: info.pdfFileId,
    };
  }

  async pdf(token: string) {
    const page = await this.open(token, { count: false });
    if (page.state !== 'ACTIVE' || !page.pdfFileId) return null;
    return this.files.read(page.pdfFileId);
  }

  /**
   * "I accept" on a quote link: records name and time (and a hash of the IP). It does not accept
   * the quote by itself; you confirm it in the desk.
   */
  async accept(token: string, name: string, meta: { ip: string | null; userAgent: string | null }) {
    const page = await this.open(token, { count: false });
    if (page.state !== 'ACTIVE')
      return { ok: false as const, error: 'This link is no longer active.' };
    if (!page.quote) return { ok: false as const, error: 'Only quotes can be accepted here.' };
    if (page.quoteState !== 'LIVE')
      return {
        ok: false as const,
        error:
          page.quoteState === 'EXPIRED'
            ? 'This quote has expired.'
            : 'This quote can no longer be accepted.',
      };
    if (page.accepted) return { ok: true as const };
    const ipHash = meta.ip
      ? createHash('sha256')
          .update(`share-accept:${this.config.JWT_SECRET}:${meta.ip}`)
          .digest('hex')
      : null;
    await this.ds.query(
      `INSERT INTO share_acceptance (share_id, name, accepted_at, ip_hash, user_agent) VALUES ($1, $2, $3, $4, $5)`,
      [page.shareId, name, this.now(), ipHash, meta.userAgent?.slice(0, 300) ?? null],
    );
    return { ok: true as const };
  }
}
