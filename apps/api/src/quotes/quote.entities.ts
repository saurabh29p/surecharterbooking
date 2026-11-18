import type {
  CancellationSchedule,
  CommissionBasis,
  InvoicingModel,
  OutwardQuote,
  QuoteStatus,
  QuoteTotals,
} from '@shubhjets/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Audited } from '../audit/audited.js';
import { paise } from '../db/transformers.js';

/**
 * One version of a wedding's quote. `totals` holds internal figures (cost, margin, commission)
 * and never leaves the desk; `snapshot` is the client-safe content frozen when the quote is issued.
 */
@Audited('quote', { ignore: ['createdBy', 'totals', 'snapshot'] })
@Entity('quote')
export class Quote {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'wedding_id' }) weddingId!: string;
  @Column('integer') version!: number;
  @Column('uuid', { name: 'business_profile_id' }) businessProfileId!: string;
  @Column('text') status!: QuoteStatus;
  @Column('timestamptz', { name: 'valid_until', nullable: true }) validUntil!: Date | null;
  @Column('integer', { name: 'validity_hours' }) validityHours!: number;
  @Column('integer', { name: 'gst_rate_bps' }) gstRateBps!: number;
  @Column('text', { name: 'gst_sac', nullable: true }) gstSac!: string | null;
  @Column('text', { name: 'invoicing_model' }) invoicingModel!: InvoicingModel;
  @Column('char', { name: 'place_of_supply_state', length: 2, nullable: true })
  placeOfSupplyState!: string | null;
  /** Our extra cancellation conditions (free text under the table). */
  @Column('text', { name: 'cancellation_terms', nullable: true }) cancellationTerms!: string | null;
  @Column('jsonb', { name: 'cancellation_schedule', nullable: true })
  cancellationSchedule!: CancellationSchedule | null;
  @Column('integer', { name: 'payment_plan_bps', array: true }) paymentPlanBps!: number[];
  @Column('text', { name: 'commission_basis', nullable: true })
  commissionBasis!: CommissionBasis | null;
  @Column('integer', { name: 'commission_bps', nullable: true }) commissionBps!: number | null;
  @Column('text', { nullable: true }) inclusions!: string | null;
  @Column('text', { nullable: true }) exclusions!: string | null;
  @Column('jsonb') totals!: QuoteTotals | Record<string, never>;
  @Column('jsonb', { nullable: true }) snapshot!: OutwardQuote | null;
  @Column('timestamptz', { name: 'issued_at', nullable: true }) issuedAt!: Date | null;
  @Column('timestamptz', { name: 'shared_at', nullable: true }) sharedAt!: Date | null;
  @Column('timestamptz', { name: 'accepted_at', nullable: true }) acceptedAt!: Date | null;
  @Column('text', { name: 'accepted_name', nullable: true }) acceptedName!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}

/**
 * A priced line. With a leg and a rate: one jet on one leg (cost = that leg's share of the
 * operator's rate, plus our markup). Without a leg: an extra with its own cost and sell price.
 */
@Entity('quote_line')
export class QuoteLine {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'quote_id' }) quoteId!: string;
  @Column('integer') seq!: number;
  @Column('uuid', { name: 'leg_id', nullable: true }) legId!: string | null;
  @Column('uuid', { name: 'rate_response_id', nullable: true }) rateResponseId!: string | null;
  @Column('text') description!: string;
  @Column('bigint', { transformer: paise }) cost!: number;
  @Column('text', { name: 'markup_type', nullable: true }) markupType!: 'PERCENT' | 'FIXED' | null;
  /** PERCENT: basis points. FIXED: paise. */
  @Column('bigint', { name: 'markup_value', nullable: true, transformer: paise })
  markupValue!: number | null;
  @Column('bigint', { transformer: paise }) sell!: number;
}

export const QUOTE_ENTITIES = [Quote, QuoteLine];
