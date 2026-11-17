import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('airport')
export class Airport {
  @PrimaryColumn('char', { length: 3 }) iata!: string;
  @Column('char', { length: 4, nullable: true }) icao!: string | null;
  @Column('text') city!: string;
  @Column('text') name!: string;
  @Column('char', { name: 'state_code', length: 2, nullable: true }) stateCode!: string | null;
  @Column('char', { length: 2 }) country!: string;
}
