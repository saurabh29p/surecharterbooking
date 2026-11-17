import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('file')
export class StoredFile {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text', { name: 'storage_key' }) storageKey!: string;
  @Column('text') mime!: string;
  @Column('bigint', {
    name: 'size_bytes',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  sizeBytes!: number;
  @Column('text') sha256!: string;
  @Column('text', { name: 'original_name', nullable: true }) originalName!: string | null;
  /** Encrypted with DATA_ENCRYPTION_KEYS before storage (guest IDs); always served through the API. */
  @Column('boolean') encrypted!: boolean;
  @Column('timestamptz', { name: 'purge_at', nullable: true }) purgeAt!: Date | null;
  @Column('timestamptz', { name: 'purged_at', nullable: true }) purgedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column('uuid', { name: 'created_by', nullable: true }) createdBy!: string | null;
}
