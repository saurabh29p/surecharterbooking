import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Audited } from '../audit/audited.js';

/** A guest on one leg. Their ID file is encrypted and deleted N days after the wedding's last flight. */
@Audited('guest')
@Entity('guest')
export class Guest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'leg_id' }) legId!: string;
  @Column('text') name!: string;
  @Column('text', { nullable: true }) phone!: string | null;
  @Column('boolean', { name: 'id_received' }) idReceived!: boolean;
  @Column('uuid', { name: 'id_file_id', nullable: true }) idFileId!: string | null;
  @Column('timestamptz', { name: 'id_purge_at', nullable: true }) idPurgeAt!: Date | null;
  @Column('timestamptz', { name: 'id_deleted_at', nullable: true }) idDeletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
