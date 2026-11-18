import type { ConsentSource, ConsentSubject } from '@shubhjets/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Audited } from '../audit/audited.js';

@Audited('client', { ignore: ['createdBy'] })
@Entity('client')
export class Client {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text') type!: 'FAMILY' | 'CORPORATE';
  @Column('text') name!: string;
  @Column('text', { nullable: true }) phone!: string | null;
  @Column('text', { nullable: true }) email!: string | null;
  @Column('text', { nullable: true }) gstin!: string | null;
  @Column('uuid', { name: 'partner_id', nullable: true }) partnerId!: string | null;
  @Column('text', { nullable: true }) notes!: string | null;
  @Column('timestamptz', { name: 'deleted_at', nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}

/** One consent given (and possibly later withdrawn) by a partner, client, enquirer or guest. */
@Audited('consent')
@Entity('consent')
export class Consent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text', { name: 'subject_type' }) subjectType!: ConsentSubject;
  @Column('uuid', { name: 'subject_id' }) subjectId!: string;
  @Column('text', { name: 'notice_version' }) noticeVersion!: string;
  @Column('timestamptz', { name: 'given_at' }) givenAt!: Date;
  @Column('text') source!: ConsentSource;
  @Column('timestamptz', { name: 'withdrawn_at', nullable: true }) withdrawnAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

export const CLIENT_ENTITIES = [Client, Consent];
