import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ConsentSource, ConsentSubject } from '@shubhjets/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { SettingsService } from '../settings/settings.service.js';
import { Consent } from './client.entities.js';

const SUBJECT_TABLES: Record<ConsentSubject, string> = {
  PARTNER: 'partner',
  CLIENT: 'client',
  ENQUIRY: 'enquiry',
  GUEST: 'guest',
};

/** Consent records (DPDP Act 2023): notice version, time and source, kept even after withdrawal. */
@Injectable()
export class ConsentService {
  now: () => Date = () => new Date();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
  ) {}

  list(
    subjectType: ConsentSubject,
    subjectId: string,
    m: EntityManager = this.ds.manager,
  ): Promise<Consent[]> {
    return m
      .getRepository(Consent)
      .find({ where: { subjectType, subjectId }, order: { givenAt: 'DESC' } });
  }

  async record(
    input: {
      subjectType: ConsentSubject;
      subjectId: string;
      source: ConsentSource;
      givenAt?: Date | null;
    },
    m: EntityManager = this.ds.manager,
  ): Promise<Consent> {
    const [exists] = await m.query(
      `SELECT 1 FROM ${SUBJECT_TABLES[input.subjectType]} WHERE id = $1`,
      [input.subjectId],
    );
    if (!exists) throw new NotFoundException('That person or business was not found');
    const givenAt = input.givenAt ?? this.now();
    if (givenAt.getTime() > this.now().getTime() + 60_000)
      throw new BadRequestException({
        message: 'Please fix the highlighted fields',
        fields: { givenAt: 'Consent cannot be in the future' },
      });
    const repo = m.getRepository(Consent);
    return repo.save(
      repo.create({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        source: input.source,
        givenAt,
        noticeVersion: await this.settings.get<string>('privacy.notice_version'),
        withdrawnAt: null,
      }),
    );
  }

  async withdraw(id: string): Promise<Consent> {
    const repo = this.ds.getRepository(Consent);
    const c = await repo.findOneBy({ id });
    if (!c) throw new NotFoundException('Consent record not found');
    if (c.withdrawnAt) throw new ConflictException('This consent was already withdrawn');
    c.withdrawnAt = this.now();
    return repo.save(c);
  }

  /** Has this person a current (not withdrawn) consent? */
  async hasActive(subjectType: ConsentSubject, subjectId: string): Promise<boolean> {
    const [row] = await this.ds.query(
      `SELECT 1 FROM consent WHERE subject_type = $1 AND subject_id = $2 AND withdrawn_at IS NULL LIMIT 1`,
      [subjectType, subjectId],
    );
    return !!row;
  }
}
