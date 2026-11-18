import type { ActivityKind, CommissionBasis, PartnerStatus, PartnerType } from '@shubhjets/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Audited } from '../audit/audited.js';

@Audited('partner', { ignore: ['createdBy'] })
@Entity('partner')
export class Partner {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text') type!: PartnerType;
  @Column('text') firm!: string;
  @Column('text', { nullable: true }) city!: string | null;
  @Column('text', { name: 'contact_person', nullable: true }) contactPerson!: string | null;
  @Column('text', { nullable: true }) phone!: string | null;
  @Column('text', { nullable: true }) email!: string | null;
  @Column('text', { nullable: true }) website!: string | null;
  @Column('text', { nullable: true }) instagram!: string | null;
  @Column('text', { name: 'source_link', nullable: true }) sourceLink!: string | null;
  @Column('text', { name: 'fit_note', nullable: true }) fitNote!: string | null;
  @Column('text') status!: PartnerStatus;
  @Column('text', { name: 'commission_basis' }) commissionBasis!: CommissionBasis;
  @Column('integer', { name: 'commission_bps' }) commissionBps!: number;
  @Column('boolean', { name: 'referral_signed' }) referralSigned!: boolean;
  @Column('uuid', { name: 'referral_file_id', nullable: true }) referralFileId!: string | null;
  @Column('date', { name: 'next_follow_up_on', nullable: true }) nextFollowUpOn!: string | null;
  @Column('text', { nullable: true }) notes!: string | null;
  @Column('timestamptz', { name: 'deleted_at', nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}

@Audited('partner_activity', { ignore: ['createdBy'] })
@Entity('partner_activity')
export class PartnerActivity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'partner_id' }) partnerId!: string;
  @Column('text') kind!: ActivityKind;
  @Column('text', { nullable: true }) note!: string | null;
  @Column('timestamptz') at!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}

export const PARTNER_ENTITIES = [Partner, PartnerActivity];
