import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Audited } from '../audit/audited.js';

@Audited('setting', { ignore: ['updatedBy'] })
@Entity('setting')
export class Setting {
  @PrimaryColumn('text') key!: string;
  @Column('jsonb') value!: unknown;
  /** False for values that still need checking (e.g. GST rates until the CA confirms). */
  @Column('boolean') confirmed!: boolean;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @Column('uuid', { name: 'updated_by', nullable: true }) updatedBy!: string | null;
}
