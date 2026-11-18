import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Audited } from '../audit/audited.js';
import { paise } from '../db/transformers.js';

/** A GST tax invoice. Numbers run per business profile and financial year and are never reused. */
@Audited('invoice', { ignore: ['createdBy'] })
@Entity('invoice')
export class Invoice {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'wedding_id' }) weddingId!: string;
  @Column('uuid', { name: 'business_profile_id' }) businessProfileId!: string;
  @Column('uuid', { name: 'quote_id', nullable: true }) quoteId!: string | null;
  @Column('text') fy!: string;
  @Column('integer') seq!: number;
  @Column('text') number!: string;
  @Column('date', { name: 'issued_on' }) issuedOn!: string;
  @Column('text', { name: 'buyer_name' }) buyerName!: string;
  @Column('text', { name: 'buyer_gstin', nullable: true }) buyerGstin!: string | null;
  @Column('char', { name: 'place_of_supply_state', length: 2, nullable: true })
  placeOfSupplyState!: string | null;
  @Column('bigint', { transformer: paise }) taxable!: number;
  @Column('bigint', { transformer: paise }) cgst!: number;
  @Column('bigint', { transformer: paise }) sgst!: number;
  @Column('bigint', { transformer: paise }) igst!: number;
  @Column('bigint', { transformer: paise }) total!: number;
  @Column('uuid', { name: 'document_id', nullable: true }) documentId!: string | null;
  @Column('timestamptz', { name: 'cancelled_at', nullable: true }) cancelledAt!: Date | null;
  @Column('text', { name: 'cancel_reason', nullable: true }) cancelReason!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}
