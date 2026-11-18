import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  GST_KEYS,
  normaliseSetting,
  settingDef,
  settingsWarnings,
  validateSetting,
} from '@shubhjets/shared';
import type { DataSource, Repository } from 'typeorm';
import { Setting } from './setting.entity.js';

export interface SettingsView {
  settings: { key: string; value: unknown; confirmed: boolean; updatedAt: Date }[];
  /** Banner messages (e.g. GST not yet confirmed by the CA). */
  warnings: string[];
}

export interface SettingsUpdate {
  values: Record<string, unknown>;
  /** true = "my CA has confirmed the GST rate and SAC code"; false = mark them unconfirmed again. */
  confirmGst?: boolean;
}

const fieldErrors = (fields: Record<string, string>) =>
  new BadRequestException({ message: 'Please fix the highlighted fields', fields });

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async get<T>(key: string): Promise<T> {
    const row = await this.repo.findOneBy({ key });
    if (!row) throw new Error(`Setting "${key}" is missing; run migrations`);
    return row.value as T;
  }

  async view(): Promise<SettingsView> {
    const rows = await this.repo.find({ order: { key: 'ASC' } });
    return {
      settings: rows.map((r) => ({
        key: r.key,
        value: r.value,
        confirmed: r.confirmed,
        updatedAt: r.updatedAt,
      })),
      warnings: settingsWarnings(rows),
    };
  }

  /**
   * Change several settings at once; all or nothing.
   * Editing the GST rate or SAC code marks them unconfirmed unless `confirmGst` is true in the same save.
   */
  async update(input: SettingsUpdate, userId: string): Promise<SettingsView> {
    const fields: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(input.values)) {
      const def = settingDef(key);
      if (!def) {
        fields[key] = 'Unknown setting';
        continue;
      }
      const value = typeof raw === 'string' ? raw.trim() : raw;
      const problem = validateSetting(def, value);
      if (problem) fields[key] = problem;
      else values[key] = normaliseSetting(def, value);
    }
    if (Object.keys(fields).length) throw fieldErrors(fields);

    await this.ds.transaction(async (m) => {
      const repo = m.getRepository(Setting);
      const rows = new Map((await repo.find()).map((r) => [r.key, r]));
      const gstTouched = GST_KEYS.some(
        (k) => k in values && JSON.stringify(values[k]) !== JSON.stringify(rows.get(k)?.value),
      );
      if (input.confirmGst === true) {
        const sac = (values['gst.sac'] ?? rows.get('gst.sac')?.value) as string;
        if (!sac) throw fieldErrors({ 'gst.sac': 'Add the SAC code before confirming' });
      }
      for (const [key, value] of Object.entries(values)) {
        const row = rows.get(key);
        if (!row) throw new Error(`Setting "${key}" is missing; run migrations`);
        if (JSON.stringify(row.value) === JSON.stringify(value)) continue;
        row.value = value;
        row.updatedBy = userId;
        await repo.save(row);
      }
      if (input.confirmGst !== undefined || gstTouched) {
        const confirmed = input.confirmGst === true;
        for (const key of GST_KEYS) {
          const row = rows.get(key)!;
          if (row.confirmed === confirmed) continue;
          row.confirmed = confirmed;
          row.updatedBy = userId;
          await repo.save(row);
        }
      }
    });
    return this.view();
  }
}
