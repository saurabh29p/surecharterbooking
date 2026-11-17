import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Who we invoice and sign as. Several are allowed; exactly one is the default. */
@Entity('business_profile')
export class BusinessProfile {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text') label!: string;
  @Column('text', { name: 'brand_name', nullable: true }) brandName!: string | null;
  @Column('text', { name: 'legal_name', nullable: true }) legalName!: string | null;
  @Column('text', { nullable: true }) llpin!: string | null;
  @Column('text', { nullable: true }) gstin!: string | null;
  /** GST state code, e.g. "07" = Delhi. */
  @Column('char', { name: 'state_code', length: 2 }) stateCode!: string;
  @Column('text', { name: 'registered_address', nullable: true }) registeredAddress!: string | null;
  @Column('bytea', { name: 'bank_details_enc', nullable: true, select: false })
  bankDetailsEnc!: Buffer | null;
  /** Safe-to-show summary, e.g. "HDFC Bank ••••1234". */
  @Column('text', { name: 'bank_hint', nullable: true }) bankHint!: string | null;
  @Column('text', { name: 'signatory_name', nullable: true }) signatoryName!: string | null;
  @Column('text', { name: 'signatory_designation', nullable: true }) signatoryDesignation!:
    string | null;
  @Column('text', { name: 'arbitration_seat_city', nullable: true }) arbitrationSeatCity!:
    string | null;
  @Column('uuid', { name: 'logo_file_id', nullable: true }) logoFileId!: string | null;
  @Column('text', { name: 'invoice_prefix' }) invoicePrefix!: string;
  @Column('boolean', { name: 'is_default' }) isDefault!: boolean;
  @Column('timestamptz', { name: 'archived_at', nullable: true }) archivedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}
