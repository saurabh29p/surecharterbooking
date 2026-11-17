import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { formatDateTime } from '@shubhjets/shared';
import type { DataSource } from 'typeorm';
import { Public } from './auth/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.ds.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
    const now = new Date();
    return { status: 'ok', database: 'ok', time: now.toISOString(), timeIst: formatDateTime(now) };
  }
}
