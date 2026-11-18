import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { AGREEMENT_KINDS } from '@shubhjets/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { optionalText } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AcceptFile, requireFile } from '../files/upload.js';
import { AgreementsService } from './agreements.service.js';
import { DocumentsService } from './documents.service.js';
import { RateRequestDocsService } from './rate-request-docs.service.js';

const uuid = () => new ParseUUIDPipe();

const AgreementBody = z
  .object({
    kind: z.enum(AGREEMENT_KINDS),
    operatorId: z.string().uuid().optional(),
    weddingId: z.string().uuid().optional(),
    partnerId: z.string().uuid().optional(),
  })
  .refine(
    (b) =>
      (b.kind === 'OPERATOR_AGREEMENT' && b.operatorId) ||
      (b.kind === 'CLIENT_TERMS' && b.weddingId) ||
      (b.kind === 'REFERRAL_AGREEMENT' && b.partnerId),
    { message: 'Say which operator, wedding or partner the agreement is for' },
  );

const ListQuery = z.object({
  weddingId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
  partnerId: z.string().uuid().optional(),
});

const SentBody = z.object({
  channel: z
    .enum([
      'WEB_SHARE',
      'WHATSAPP',
      'TELEGRAM',
      'EMAIL',
      'INSTAGRAM',
      'MESSENGER',
      'COPY_LINK',
      'DOWNLOAD',
    ])
    .default('WEB_SHARE'),
  recipient: optionalText(200),
});

export function sendFile(
  res: Response,
  f: { bytes: Buffer; filename: string; mime?: string },
  inline = false,
): StreamableFile {
  res.setHeader('Content-Type', f.mime ?? 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${f.filename.replace(/["\\]/g, '')}"`,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(f.bytes);
}

@Controller()
export class DocumentsController {
  constructor(
    private readonly agreements: AgreementsService,
    private readonly documents: DocumentsService,
    private readonly rateRequests: RateRequestDocsService,
  ) {}

  /** The rate request as a branded PDF for the operator (a new version each time). */
  @Post('rate-requests/:id/pdf')
  rateRequestPdf(@Param('id', uuid()) id: string, @CurrentUser() user: AuthUser) {
    return this.rateRequests.generate(id, user.id);
  }

  /** Makes a new version of an agreement from the current template and the record's details. */
  @Post('agreements')
  generate(
    @Body(new ZodPipe(AgreementBody)) body: z.infer<typeof AgreementBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.agreements.generate(body.kind, body, user.id);
  }

  @Get('documents')
  list(@Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.documents.list(q);
  }

  @Get('documents/:id/pdf')
  async pdf(
    @Param('id', uuid()) id: string,
    @Query('version') version: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const n = version ? Number(version) : undefined;
    return sendFile(res, await this.documents.pdf(id, Number.isInteger(n) ? n : undefined));
  }

  @Get('documents/:id/signed')
  async signed(@Param('id', uuid()) id: string, @Res({ passthrough: true }) res: Response) {
    return sendFile(res, await this.documents.signedCopy(id));
  }

  @Post('documents/:id/sent')
  @HttpCode(204)
  async sent(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(SentBody)) body: z.infer<typeof SentBody>,
    @CurrentUser() user: AuthUser,
  ) {
    await this.documents.markSent(id, body.channel, body.recipient ?? null, user.id);
  }

  /** Upload the signed copy (PDF or photo) of the latest version. */
  @Post('documents/:id/signed')
  @HttpCode(204)
  @AcceptFile()
  async uploadSigned(
    @Param('id', uuid()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const f = requireFile(file);
    await this.documents.uploadSigned(
      id,
      { buffer: f.buffer, originalName: f.originalname },
      user.id,
    );
  }
}
