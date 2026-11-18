import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DOCUMENT_TYPE_LABELS, toIstDate, type DocumentType } from '@shubhjets/shared';
import type { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { FilesService } from '../files/files.service.js';
import { DocumentRecord, DocumentVersion } from './document.entities.js';

export type ShareChannel =
  | 'WEB_SHARE'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'EMAIL'
  | 'INSTAGRAM'
  | 'MESSENGER'
  | 'COPY_LINK'
  | 'DOWNLOAD';

export interface DocumentFilter {
  weddingId?: string;
  operatorId?: string;
  partnerId?: string;
}

/**
 * Documents the app made (agreements, invoices, rate requests, quotes): their versions, PDFs,
 * share log and signed copies. Signing is recorded by uploading the signed copy (BRIEF.md §5.5);
 * a draft that a lawyer has not approved cannot be marked signed.
 */
@Injectable()
export class DocumentsService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  async list(f: DocumentFilter) {
    const where: string[] = [];
    const params: string[] = [];
    for (const [col, val] of [
      ['wedding_id', f.weddingId],
      ['operator_id', f.operatorId],
      ['partner_id', f.partnerId],
    ] as const) {
      if (val) {
        params.push(val);
        where.push(`d.${col} = $${params.length}`);
      }
    }
    if (!where.length) throw new BadRequestException('Say which wedding, operator or partner');
    const docs: Record<string, unknown>[] = await this.ds.query(
      `SELECT d.id, d.type, d.status, d.created_at, d.updated_at, d.quote_id, d.invoice_id, d.rate_request_id,
              i.number AS invoice_number, i.cancelled_at AS invoice_cancelled_at,
              q.version AS quote_version
         FROM document d
         LEFT JOIN invoice i ON i.id = d.invoice_id
         LEFT JOIN quote q ON q.id = d.quote_id
        WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC`,
      params,
    );
    if (!docs.length) return [];
    const ids = docs.map((d) => d.id as string);
    const versions: Record<string, unknown>[] = await this.ds.query(
      `SELECT dv.id, dv.document_id, dv.version, dv.watermark, dv.missing_fields, dv.created_at,
              dv.signed_file_id IS NOT NULL AS signed, tv.version AS template_version
         FROM document_version dv LEFT JOIN template_version tv ON tv.id = dv.template_version_id
        WHERE dv.document_id = ANY($1) ORDER BY dv.version DESC`,
      [ids],
    );
    const shares: Record<string, unknown>[] = await this.ds.query(
      `SELECT s.id, dv.document_id, dv.version, s.channel, s.recipient, s.shared_at
         FROM share s JOIN document_version dv ON dv.id = s.document_version_id
        WHERE dv.document_id = ANY($1) ORDER BY s.shared_at DESC`,
      [ids],
    );
    return docs.map((d) => ({
      id: d.id as string,
      type: d.type as DocumentType,
      label: DOCUMENT_TYPE_LABELS[d.type as DocumentType],
      status: d.status as string,
      quoteId: d.quote_id as string | null,
      quoteVersion: d.quote_version as number | null,
      invoice: d.invoice_id
        ? {
            id: d.invoice_id as string,
            number: d.invoice_number as string,
            cancelled: !!d.invoice_cancelled_at,
          }
        : null,
      rateRequestId: d.rate_request_id as string | null,
      updatedAt: d.updated_at as Date,
      versions: versions
        .filter((v) => v.document_id === d.id)
        .map((v) => ({
          id: v.id as string,
          version: v.version as number,
          draft: v.watermark as boolean,
          missing: v.missing_fields as string[],
          signed: v.signed as boolean,
          templateVersion: v.template_version as number | null,
          createdAt: v.created_at as Date,
        })),
      shares: shares
        .filter((s) => s.document_id === d.id)
        .map((s) => ({
          id: s.id as string,
          version: s.version as number,
          channel: s.channel as string,
          recipient: s.recipient as string | null,
          sharedAt: s.shared_at as Date,
        })),
    }));
  }

  private async find(id: string): Promise<DocumentRecord> {
    const d = await this.ds.getRepository(DocumentRecord).findOneBy({ id });
    if (!d) throw new NotFoundException('Document not found');
    return d;
  }

  private async version(documentId: string, version?: number): Promise<DocumentVersion> {
    const v = await this.ds.getRepository(DocumentVersion).findOne({
      where: version ? { documentId, version } : { documentId },
      order: { version: 'DESC' },
    });
    if (!v) throw new NotFoundException('Document version not found');
    return v;
  }

  /** The PDF of a version (latest by default), as it was made. */
  async pdf(id: string, version?: number) {
    await this.find(id);
    const v = await this.version(id, version);
    if (!v.pdfFileId) throw new NotFoundException('This version has no PDF');
    const { file, bytes } = await this.files.read(v.pdfFileId);
    return { bytes, filename: file.originalName ?? 'document.pdf', mime: file.mime };
  }

  async signedCopy(id: string) {
    await this.find(id);
    const v = await this.version(id);
    if (!v.signedFileId) throw new NotFoundException('No signed copy uploaded yet');
    const { file, bytes } = await this.files.read(v.signedFileId);
    return { bytes, filename: file.originalName ?? 'signed.pdf', mime: file.mime };
  }

  /** You sent the latest version yourself; logged with channel and recipient. */
  async markSent(id: string, channel: ShareChannel, recipient: string | null, userId: string) {
    await this.ds.transaction(async (m) => {
      const d = await m.getRepository(DocumentRecord).findOneBy({ id });
      if (!d) throw new NotFoundException('Document not found');
      if (d.type === 'QUOTE') throw new ConflictException("Use the quote's Share button");
      const v = await m
        .getRepository(DocumentVersion)
        .findOne({ where: { documentId: id }, order: { version: 'DESC' } });
      if (!v) throw new NotFoundException('Document version not found');
      const [share] = await m.query(
        `INSERT INTO share (document_version_id, channel, recipient, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [v.id, channel, recipient, userId],
      );
      if (d.status === 'DRAFT') {
        d.status = 'SHARED';
        await m.getRepository(DocumentRecord).save(d);
      }
      await this.audit.record(
        {
          entity: 'document',
          entityId: id,
          action: 'SHARED',
          diff: { version: v.version, channel, recipient, shareId: share.id },
        },
        m,
      );
    });
  }

  /**
   * Upload the signed copy of the latest version. Refused for drafts: a template your lawyer
   * has not approved says "DRAFT – NOT FOR SIGNATURE" on every page.
   */
  async uploadSigned(
    id: string,
    upload: { buffer: Buffer; originalName: string },
    userId: string,
  ): Promise<void> {
    const d = await this.find(id);
    if (!['OPERATOR_AGREEMENT', 'CLIENT_TERMS', 'REFERRAL_AGREEMENT'].includes(d.type))
      throw new ConflictException('Only agreements are signed');
    const v = await this.version(id);
    if (v.watermark)
      throw new ConflictException(
        'This version is a draft (its template is not lawyer-approved), so it is not for signature. Approve the template in Settings, make a new version, then upload its signed copy.',
      );
    const file = await this.files.upload({ ...upload, purpose: 'signed-document' });
    await this.ds.transaction(async (m) => {
      v.signedFileId = file.id;
      await m.getRepository(DocumentVersion).save(v);
      d.status = 'SIGNED';
      await m.getRepository(DocumentRecord).save(d);
      if (d.type === 'REFERRAL_AGREEMENT' && d.partnerId) {
        await m.query(
          `UPDATE partner SET referral_signed = true, referral_document_id = $2, updated_at = now() WHERE id = $1`,
          [d.partnerId, d.id],
        );
      }
      if (d.type === 'OPERATOR_AGREEMENT' && d.operatorId) {
        // The operator's documents keep their own copy (removing one there must not remove this).
        const copy = await this.files.upload({ ...upload, purpose: 'operator-document' }, m);
        await m.query(
          `INSERT INTO operator_document (operator_id, kind, file_id, verified_on, verified_by, notes)
           VALUES ($1, 'OPERATOR_AGREEMENT', $2, $3, $4, $5)`,
          [
            d.operatorId,
            copy.id,
            toIstDate(this.now()),
            userId,
            `Signed copy of agreement version ${v.version}`,
          ],
        );
      }
      await this.audit.record(
        { entity: 'document', entityId: id, action: 'SIGNED', diff: { version: v.version } },
        m,
      );
    });
  }
}
