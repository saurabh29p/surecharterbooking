import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Setting } from './setting.entity.js';

/** Read access to settings. Editing (with the GST confirmation banner) arrives with the Settings screen. */
@Injectable()
export class SettingsService {
  constructor(@InjectRepository(Setting) private readonly repo: Repository<Setting>) {}

  async get<T>(key: string): Promise<T> {
    const row = await this.repo.findOneBy({ key });
    if (!row) throw new Error(`Setting "${key}" is missing; run migrations`);
    return row.value as T;
  }

  async all(): Promise<Setting[]> {
    return this.repo.find({ order: { key: 'ASC' } });
  }
}
