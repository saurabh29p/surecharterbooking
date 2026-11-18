import { Body, Controller, Get, Header, HttpCode, Param, Post, Res } from '@nestjs/common';
import { templateCsv, type ImportKind } from '@shubhjets/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { BOM, ExportsService } from './exports.service.js';
import { ImportsService } from './imports.service.js';

const Kind = new ZodPipe(
  z.enum(['partners', 'operators'], { message: 'Choose partners or operators' }),
);
const PreviewBody = z.object({
  csv: z.string().min(1, 'Choose a CSV file'),
  mapping: z.record(z.string(), z.number().int().nullable()).optional(),
});
const CommitBody = PreviewBody.extend({
  decisions: z.record(z.string().regex(/^\d+$/), z.enum(['add', 'merge', 'skip'])).default({}),
});

@Controller()
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly exportsSvc: ExportsService,
  ) {}

  /** Template with the exact headers and one fake example row. */
  @Get('imports/templates/:kind.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  template(@Param('kind', Kind) kind: ImportKind, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-template.csv"`);
    return BOM + templateCsv(kind);
  }

  @Post('imports/:kind/preview')
  @HttpCode(200)
  preview(
    @Param('kind', Kind) kind: ImportKind,
    @Body(new ZodPipe(PreviewBody)) body: z.infer<typeof PreviewBody>,
  ) {
    return this.imports.preview(kind, body.csv, body.mapping);
  }

  @Post('imports/:kind/commit')
  @HttpCode(200)
  commit(
    @Param('kind', Kind) kind: ImportKind,
    @Body(new ZodPipe(CommitBody)) body: z.infer<typeof CommitBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.imports.commit(kind, body.csv, body.mapping, body.decisions, user.id);
  }

  @Get('exports/partners.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async partners(@Res({ passthrough: true }) res: Response) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${this.exportsSvc.fileName('partners')}"`,
    );
    return this.exportsSvc.partnersCsv();
  }

  @Get('exports/weddings.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async weddings(@Res({ passthrough: true }) res: Response) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${this.exportsSvc.fileName('weddings')}"`,
    );
    return this.exportsSvc.weddingsCsv();
  }
}
