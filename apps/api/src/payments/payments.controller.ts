import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { optionalText } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AcceptFile, requireFile } from '../files/upload.js';
import { PaymentsService } from './payments.service.js';

const uuid = () => new ParseUUIDPipe();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');
const MODES = ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH', 'OTHER'] as const;

const PaymentBody = z
  .object({
    direction: z.enum(['CLIENT_IN', 'OPERATOR_OUT', 'PARTNER_OUT']),
    operatorId: z.string().uuid().nullable().optional(),
    partnerId: z.string().uuid().nullable().optional(),
    /** Paise. */
    amount: z
      .number({ message: 'Enter the amount in rupees' })
      .int()
      .positive('Enter the amount in rupees'),
    gstAmount: z.number().int().min(0, 'GST cannot be negative').optional(),
    tdsBps: z.number().int().min(0).max(3000, 'TDS above 30% looks wrong').nullable().optional(),
    paid: z.boolean().optional(),
    paidOn: date.nullable().optional(),
    mode: z.enum(MODES).optional(),
    reference: optionalText(120),
    notes: optionalText(1000),
  })
  .refine((b) => b.direction !== 'OPERATOR_OUT' || !!b.operatorId, {
    message: 'Choose the operator',
    path: ['operatorId'],
  });

const PaidBody = z.object({
  paidOn: date,
  mode: z.enum(MODES).optional(),
  reference: optionalText(120),
});

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('weddings/:id/money')
  summary(@Param('id', uuid()) id: string) {
    return this.payments.summary(id);
  }

  @Post('weddings/:id/payments')
  record(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(PaymentBody)) body: z.infer<typeof PaymentBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.record(id, body, user.id);
  }

  @Post('payments/:id/paid')
  @HttpCode(204)
  async paid(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(PaidBody)) body: z.infer<typeof PaidBody>,
  ) {
    await this.payments.markPaid(id, body);
  }

  @Delete('payments/:id')
  @HttpCode(204)
  async remove(@Param('id', uuid()) id: string) {
    await this.payments.remove(id);
  }

  @Post('payments/:id/restore')
  @HttpCode(204)
  async restore(@Param('id', uuid()) id: string) {
    await this.payments.restore(id);
  }

  @Post('payments/:id/receipt')
  @HttpCode(204)
  @AcceptFile()
  async receipt(
    @Param('id', uuid()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const f = requireFile(file);
    await this.payments.setReceipt(id, { buffer: f.buffer, originalName: f.originalname });
  }

  @Post('payments/:id/receipt/link')
  receiptLink(@Param('id', uuid()) id: string) {
    return this.payments.receiptLink(id);
  }

  /** Rule 2: confirm the wedding once terms are signed and the required payment is in. */
  @Post('weddings/:id/confirm')
  @HttpCode(204)
  async confirm(@Param('id', uuid()) id: string) {
    await this.payments.confirm(id);
  }

  @Post('legs/:id/flown')
  @HttpCode(204)
  async flown(@Param('id', uuid()) id: string) {
    await this.payments.markFlown(id);
  }

  @Delete('legs/:id/flown')
  @HttpCode(204)
  async notFlown(@Param('id', uuid()) id: string) {
    await this.payments.unmarkFlown(id);
  }
}
