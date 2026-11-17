import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ActorType = 'USER' | 'AI' | 'SYSTEM' | 'PUBLIC';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' }) id!: string;
  @Column('text', { name: 'actor_type' }) actorType!: ActorType;
  @Column('uuid', { name: 'actor_id', nullable: true }) actorId!: string | null;
  @Column('text') entity!: string;
  @Column('text', { name: 'entity_id' }) entityId!: string;
  @Column('text') action!: string;
  @Column('jsonb', { nullable: true }) diff!: Record<string, unknown> | null;
  @Column('timestamptz', { default: () => 'now()' }) at!: Date;
}
