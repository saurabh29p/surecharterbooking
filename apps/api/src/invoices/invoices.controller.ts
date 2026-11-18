import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { InvoicesService } from './invoices.service.js';

const uuid = () => new ParseUUIDPipe();
const IssueBody = z.object({
  issuedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the invoice date')
    .optional(),
});
const CancelBody = z.object({
  reason: z.string().trim().min(3, 'Say briefly why it is cancelled').max(300),
});

@Controller()
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  /** The wedding's invoices and what (if anything) stops a new one. */
  @Get('weddings/:id/invoices')
  list(@Param('id', uuid()) id: string) {
    return this.invoices.list(id);
  }

  @Post('weddings/:id/invoices')
  issue(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(IssueBody)) body: z.infer<typeof IssueBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoices.issue(id, user.id, body.issuedOn);
  }

  @Post('invoices/:id/cancel')
  @HttpCode(204)
  async cancel(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(CancelBody)) body: z.infer<typeof CancelBody>,
  ) {
    await this.invoices.cancel(id, body.reason);
  }
}
