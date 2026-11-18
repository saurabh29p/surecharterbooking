import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { PrivacyService, type PrivacySubject } from './privacy.service.js';

const Kind = new ZodPipe(z.enum(['client', 'partner'], { message: 'Unknown kind of person' }));
const EraseBody = z.object({
  confirm: z.literal('ERASE', { message: 'Confirm the erase first' }),
});

/** DPDP Act 2023: a copy of a person's data, and erasing it (both logged). */
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** What erasing would remove and keep, and anything blocking it. */
  @Get(':kind/:id')
  plan(@Param('kind', Kind) kind: PrivacySubject, @Param('id', ParseUUIDPipe) id: string) {
    return this.privacy.plan(kind, id);
  }

  @Get(':kind/:id/export')
  async export(
    @Param('kind', Kind) kind: PrivacySubject,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const body = await this.privacy.export(kind, id);
    res
      .set({
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="shubhjets-${kind}-data-${id.slice(0, 8)}.json"`,
        'cache-control': 'no-store',
      })
      .send(JSON.stringify(body, null, 2));
  }

  @Post(':kind/:id/erase')
  @HttpCode(200)
  erase(
    @Param('kind', Kind) kind: PrivacySubject,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(EraseBody)) _body: z.infer<typeof EraseBody>,
  ) {
    return this.privacy.erase(kind, id);
  }
}
