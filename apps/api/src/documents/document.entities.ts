import type { AgreementKind, DocumentStatus, DocumentType } from '@shubhjets/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Audited } from '../audit/audited.js';

@Entity('document_template')
export class DocumentTemplate {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text') kind!: AgreementKind;
  @Column('text') name!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/** One saved version of a template. Approved versions never change; edits make a new version. */
@Audited('template_version', { ignore: ['createdBy', 'bodyMd'] })
@Entity('template_version')
export class TemplateVersion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'template_id' }) templateId!: string;
  @Column('integer') version!: number;
  @Column('text', { name: 'body_md' }) bodyMd!: string;
  @Column('boolean', { name: 'lawyer_approved' }) lawyerApproved!: boolean;
  @Column('date', { name: 'approved_on', nullable: true }) approvedOn!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}

/** A document made by the app (quote, agreement, invoice, rate request), with its versions. */
@Audited('document', { ignore: ['createdBy'] })
@Entity('document')
export class DocumentRecord {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text') type!: DocumentType;
  @Column('text') status!: DocumentStatus;
  @Column('uuid', { name: 'business_profile_id', nullable: true }) businessProfileId!:
    string | null;
  @Column('uuid', { name: 'wedding_id', nullable: true }) weddingId!: string | null;
  @Column('uuid', { name: 'leg_id', nullable: true }) legId!: string | null;
  @Column('uuid', { name: 'operator_id', nullable: true }) operatorId!: string | null;
  @Column('uuid', { name: 'partner_id', nullable: true }) partnerId!: string | null;
  @Column('uuid', { name: 'quote_id', nullable: true }) quoteId!: string | null;
  @Column('uuid', { name: 'invoice_id', nullable: true }) invoiceId!: string | null;
  @Column('uuid', { name: 'rate_request_id', nullable: true }) rateRequestId!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}

@Audited('document_version', { ignore: ['createdBy'] })
@Entity('document_version')
export class DocumentVersion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'document_id' }) documentId!: string;
  @Column('integer') version!: number;
  @Column('uuid', { name: 'template_version_id', nullable: true }) templateVersionId!:
    string | null;
  @Column('uuid', { name: 'pdf_file_id', nullable: true }) pdfFileId!: string | null;
  @Column('uuid', { name: 'signed_file_id', nullable: true }) signedFileId!: string | null;
  @Column('boolean') watermark!: boolean;
  @Column('text') audience!: 'INTERNAL' | 'OUTWARD';
  @Column('text', { name: 'missing_fields', array: true }) missingFields!: string[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}

export const DOCUMENT_ENTITIES = [
  DocumentTemplate,
  TemplateVersion,
  DocumentRecord,
  DocumentVersion,
];
