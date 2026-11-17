import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { AuditService } from './audit.service.js';

const AuditQueryParams = z.object({
  entity: z
    .string()
    .regex(/^[a-z_]+$/)
    .optional(),
  entityId: z.string().max(100).optional(),
  before: z
    .string()
    .regex(/^[0-9]+$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query(new ZodPipe(AuditQueryParams)) q: z.infer<typeof AuditQueryParams>) {
    return this.audit.list(q);
  }
}
