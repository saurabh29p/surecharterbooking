import { Controller, Get } from '@nestjs/common';
import { formatDateTime } from '@shubhjets/shared';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    const now = new Date();
    return { status: 'ok', time: now.toISOString(), timeIst: formatDateTime(now) };
  }
}
