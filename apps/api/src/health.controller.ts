import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { formatDateTime } from '@shubhjets/shared';
import type { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

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
