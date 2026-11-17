import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'OWNER' | 'STAFF';

@Entity('app_user')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('text') email!: string;
  @Column('text', { name: 'password_hash', select: false }) passwordHash!: string;
  @Column('text') name!: string;
  @Column('text') role!: UserRole;
  /** Bumped by "log out all devices": every access token with an older version stops working. */
  @Column('integer', { name: 'token_version' }) tokenVersion!: number;
  @Column('timestamptz', { name: 'setup_completed_at', nullable: true })
  setupCompletedAt!: Date | null;
  @Column('timestamptz', { name: 'last_login_at', nullable: true }) lastLoginAt!: Date | null;
  @Column('timestamptz', { name: 'disabled_at', nullable: true }) disabledAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
