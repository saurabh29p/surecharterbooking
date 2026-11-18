import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  type PipeTransform,
} from '@nestjs/common';
import { AGREEMENT_KINDS, type AgreementKind } from '@shubhjets/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TemplatesService } from './templates.service.js';

export class KindPipe implements PipeTransform<string, AgreementKind> {
  transform(value: string): AgreementKind {
    const k = value.toUpperCase().replace(/-/g, '_');
    if (!(AGREEMENT_KINDS as readonly string[]).includes(k))
      throw new BadRequestException('Unknown agreement type');
    return k as AgreementKind;
  }
}

const SaveBody = z.object({ bodyMd: z.string().max(100_000) });
const ApproveBody = z.object({
  approvedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the date your lawyer approved it'),
});
const PreviewBody = z.object({ bodyMd: z.string().max(100_000).optional() });

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Get(':kind')
  get(@Param('kind', KindPipe) kind: AgreementKind) {
    return this.templates.get(kind);
  }

  @Post(':kind/versions')
  save(
    @Param('kind', KindPipe) kind: AgreementKind,
    @Body(new ZodPipe(SaveBody)) body: z.infer<typeof SaveBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.templates.saveVersion(kind, body.bodyMd, user.id);
  }

  @Post(':kind/versions/:id/approve')
  @HttpCode(200)
  approve(
    @Param('kind', KindPipe) kind: AgreementKind,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(ApproveBody)) body: z.infer<typeof ApproveBody>,
  ) {
    return this.templates.approve(kind, id, body.approvedOn);
  }

  @Post(':kind/preview')
  @HttpCode(200)
  async preview(
    @Param('kind', KindPipe) kind: AgreementKind,
    @Body(new ZodPipe(PreviewBody)) body: z.infer<typeof PreviewBody>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.templates.preview(kind, body.bodyMd);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${kind.toLowerCase()}-preview.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(pdf);
  }
}
