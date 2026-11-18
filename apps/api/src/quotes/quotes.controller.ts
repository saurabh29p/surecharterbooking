import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  AcceptBody,
  IssueBody,
  OperatorScheduleBody,
  SentBody,
  UpdateQuoteBody,
  type UpdateQuoteInput,
} from './quote.dto.js';
import { QuoteDocumentsService, type QuotePdf } from './quote-documents.service.js';
import { QuotesService } from './quotes.service.js';

const uuid = () => new ParseUUIDPipe();

function sendPdf(res: Response, pdf: QuotePdf, inline: boolean): StreamableFile {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${pdf.filename.replace(/"/g, '')}"`,
  );
  res.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(pdf.bytes);
}

@Controller()
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly documents: QuoteDocumentsService,
  ) {}

  @Get('weddings/:id/quotes')
  list(@Param('id', uuid()) id: string) {
    return this.quotes.list(id);
  }

  /** Opens the draft (creating it from the chosen jets, or as a new version of the last quote). */
  @Post('weddings/:id/quotes')
  start(@Param('id', uuid()) id: string, @CurrentUser() user: AuthUser) {
    return this.quotes.start(id, user.id);
  }

  @Get('quotes/:id')
  get(@Param('id', uuid()) id: string) {
    return this.quotes.get(id);
  }

  @Patch('quotes/:id')
  update(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(UpdateQuoteBody)) body: UpdateQuoteInput,
  ) {
    return this.quotes.update(id, body);
  }

  @Delete('quotes/:id')
  @HttpCode(204)
  async remove(@Param('id', uuid()) id: string) {
    await this.quotes.remove(id);
  }

  @Post('quotes/:id/issue')
  @HttpCode(200)
  issue(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(IssueBody)) body: z.infer<typeof IssueBody>,
  ) {
    return this.documents.issue(id, body.confirmLooser);
  }

  @Post('quotes/:id/sent')
  @HttpCode(200)
  sent(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(SentBody)) body: z.infer<typeof SentBody>,
  ) {
    return this.documents.markSent(id, body.channel, body.recipient ?? null);
  }

  /** The issued quote's PDF, exactly as stored. */
  @Get('quotes/:id/pdf')
  async pdf(@Param('id', uuid()) id: string, @Res({ passthrough: true }) res: Response) {
    return sendPdf(res, await this.documents.stored(id), false);
  }

  /** A watermarked preview of a draft (not stored). */
  @Get('quotes/:id/preview')
  async preview(@Param('id', uuid()) id: string, @Res({ passthrough: true }) res: Response) {
    return sendPdf(res, await this.documents.preview(id), true);
  }

  @Get('quotes/:id/shares')
  shares(@Param('id', uuid()) id: string) {
    return this.documents.shares(id);
  }

  @Post('quotes/:id/accept')
  @HttpCode(200)
  accept(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(AcceptBody)) body: z.infer<typeof AcceptBody>,
  ) {
    return this.quotes.accept(id, body.name);
  }

  /** The operator's cancellation charges, recorded from the quote screen. */
  @Put('rate-responses/:id/cancellation-schedule')
  @HttpCode(204)
  async operatorSchedule(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(OperatorScheduleBody)) body: z.infer<typeof OperatorScheduleBody>,
  ) {
    await this.quotes.setOperatorSchedule(id, body.schedule, body.saveForOperator);
  }
}
