import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** One row per issued refresh token. Rotation keeps the same family_id; reuse of a revoked token kills the family. */
@Entity('refresh_token')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'user_id' }) userId!: string;
  @Column('uuid', { name: 'family_id' }) familyId!: string;
  @Column('text', { name: 'token_hash' }) tokenHash!: string;
  @Column('timestamptz', { name: 'expires_at' }) expiresAt!: Date;
  @Column('timestamptz', { name: 'last_used_at', nullable: true }) lastUsedAt!: Date | null;
  @Column('timestamptz', { name: 'revoked_at', nullable: true }) revokedAt!: Date | null;
  @Column('text', { name: 'revoked_reason', nullable: true }) revokedReason!: string | null;
  @Column('text', { name: 'user_agent', nullable: true }) userAgent!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
