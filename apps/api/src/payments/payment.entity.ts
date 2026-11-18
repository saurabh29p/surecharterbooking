import type { PaymentDirection, PaymentMode, PaymentStatus } from '@shubhjets/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Audited } from '../audit/audited.js';
import { paise } from '../db/transformers.js';

/** Money in from the client, or out to an operator or partner. Never hard-deleted. */
@Audited('payment', { ignore: ['createdBy'] })
@Entity('payment')
export class Payment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'wedding_id' }) weddingId!: string;
  @Column('text') direction!: PaymentDirection;
  @Column('uuid', { name: 'operator_id', nullable: true }) operatorId!: string | null;
  @Column('uuid', { name: 'partner_id', nullable: true }) partnerId!: string | null;
  @Column('bigint', { transformer: paise }) amount!: number;
  @Column('bigint', { name: 'gst_amount', transformer: paise }) gstAmount!: number;
  @Column('integer', { name: 'tds_bps', nullable: true }) tdsBps!: number | null;
  @Column('text') status!: PaymentStatus;
  @Column('date', { name: 'paid_on', nullable: true }) paidOn!: string | null;
  @Column('text') mode!: PaymentMode;
  @Column('text', { nullable: true }) reference!: string | null;
  @Column('uuid', { name: 'receipt_file_id', nullable: true }) receiptFileId!: string | null;
  @Column('timestamptz', { name: 'payable_at', nullable: true }) payableAt!: Date | null;
  @Column('text', { nullable: true }) notes!: string | null;
  @Column('timestamptz', { name: 'deleted_at', nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}
