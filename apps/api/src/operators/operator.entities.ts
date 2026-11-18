import type {
  AircraftCategory,
  BlockKind,
  CancellationSchedule,
  OperatorDocKind,
  OperatorStatus,
} from '@shubhjets/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Audited } from '../audit/audited.js';

@Audited('operator', { ignore: ['createdBy'] })
@Entity('operator')
export class Operator {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text', { name: 'legal_name' }) legalName!: string;
  @Column('text', { nullable: true }) brand!: string | null;
  @Column('text', { nullable: true }) cin!: string | null;
  @Column('text', { nullable: true }) gstin!: string | null;
  @Column('text', { name: 'nsop_no', nullable: true }) nsopNo!: string | null;
  @Column('date', { name: 'nsop_issued_on', nullable: true }) nsopIssuedOn!: string | null;
  /** Mirrors the current verified NSOP document's expiry. */
  @Column('date', { name: 'nsop_expires_on', nullable: true }) nsopExpiresOn!: string | null;
  /** Mirrors the current verified insurance document's expiry. */
  @Column('date', { name: 'insurance_expires_on', nullable: true }) insuranceExpiresOn!:
    string | null;
  @Column('text', { nullable: true }) website!: string | null;
  @Column('text', { name: 'safety_disclosure_url', nullable: true }) safetyDisclosureUrl!:
    string | null;
  @Column('text', { name: 'source_link', nullable: true }) sourceLink!: string | null;
  @Column('integer', { name: 'dgca_rank', nullable: true }) dgcaRank!: number | null;
  @Column('date', { name: 'dgca_rank_checked_on', nullable: true }) dgcaRankCheckedOn!:
    string | null;
  @Column('text', { name: 'dgca_rank_source', nullable: true }) dgcaRankSource!: string | null;
  @Column('bytea', { name: 'bank_details_enc', nullable: true, select: false })
  bankDetailsEnc!: Buffer | null;
  @Column('text', { name: 'bank_hint', nullable: true }) bankHint!: string | null;
  @Column('text', { name: 'cancellation_terms', nullable: true }) cancellationTerms!: string | null;
  /** Their usual cancellation charges; new replies start with these. */
  @Column('jsonb', { name: 'cancellation_schedule', nullable: true })
  cancellationSchedule!: CancellationSchedule | null;
  @Column('text') status!: OperatorStatus;
  @Column('text', { name: 'blocked_reason', nullable: true }) blockedReason!: string | null;
  @Column('text', { name: 'block_kind', nullable: true }) blockKind!: BlockKind | null;
  @Column('timestamptz', { name: 'blocked_at', nullable: true }) blockedAt!: Date | null;
  @Column('timestamptz', { name: 'verified_at', nullable: true }) verifiedAt!: Date | null;
  @Column('uuid', { name: 'verified_by', nullable: true }) verifiedBy!: string | null;
  @Column('text', { nullable: true }) notes!: string | null;
  @Column('timestamptz', { name: 'deleted_at', nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}

@Entity('operator_base')
export class OperatorBase {
  @PrimaryColumn('uuid', { name: 'operator_id' }) operatorId!: string;
  @PrimaryColumn('char', { name: 'airport_iata', length: 3 }) airportIata!: string;
}

@Audited('operator_contact')
@Entity('operator_contact')
export class OperatorContact {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'operator_id' }) operatorId!: string;
  @Column('text') name!: string;
  @Column('text', { nullable: true }) role!: string | null;
  @Column('text', { nullable: true }) phone!: string | null;
  @Column('text', { nullable: true }) email!: string | null;
  @Column('boolean', { name: 'is_primary' }) isPrimary!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

@Audited('aircraft')
@Entity('aircraft')
export class Aircraft {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'operator_id' }) operatorId!: string;
  @Column('text') type!: string;
  @Column('text', { nullable: true }) registration!: string | null;
  @Column('text') category!: AircraftCategory;
  @Column('integer') seats!: number;
  @Column('integer', { nullable: true }) year!: number | null;
  @Column('char', { name: 'base_airport', length: 3, nullable: true }) baseAirport!: string | null;
  @Column('timestamptz', { name: 'deleted_at', nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Audited('operator_document')
@Entity('operator_document')
export class OperatorDocument {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'operator_id' }) operatorId!: string;
  @Column('text') kind!: OperatorDocKind;
  @Column('uuid', { name: 'file_id', nullable: true }) fileId!: string | null;
  @Column('date', { name: 'expires_on', nullable: true }) expiresOn!: string | null;
  /** "Verified by me on <date>" — set only by the owner pressing Verify. */
  @Column('date', { name: 'verified_on', nullable: true }) verifiedOn!: string | null;
  @Column('uuid', { name: 'verified_by', nullable: true }) verifiedBy!: string | null;
  @Column('text', { nullable: true }) notes!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

export const OPERATOR_ENTITIES = [
  Operator,
  OperatorBase,
  OperatorContact,
  Aircraft,
  OperatorDocument,
];
