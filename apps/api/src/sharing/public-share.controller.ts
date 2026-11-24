import { DEFAULT_BRAND } from '@shubhjets/shared';
import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { PAGE_HEADERS, renderLinkGone, renderSharePage } from './share-page.js';
import { SharingService } from './sharing.service.js';

/**
 * The secure link pages (no login: the random token is the permission). Strict headers, no
 * scripts, never indexed, rate-limited. In production the desk's site forwards /s/* here.
 */
@Public()
@Controller('s')
export class PublicShareController {
  constructor(private readonly sharing: SharingService) {}

  private async page(res: Response, token: string, error: string | null = null, status?: number) {
    const p = await this.sharing.open(token, { count: !error });
    res.set(PAGE_HEADERS).type('html');
    if (p.state !== 'ACTIVE') {
      res.status(p.state === 'UNKNOWN' ? 404 : 410).send(renderLinkGone(p.brand, p.state));
      return;
    }
    res.status(status ?? 200).send(renderSharePage({ token, ...p, error }));
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  async view(@Param('token') token: string, @Res() res: Response) {
    await this.page(res, token);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token/pdf')
  async pdf(@Param('token') token: string, @Res() res: Response) {
    const f = await this.sharing.pdf(token);
    res.set(PAGE_HEADERS);
    if (!f) {
      res.status(410).type('html').send(renderLinkGone(DEFAULT_BRAND, 'EXPIRED'));
      return;
    }
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${(f.file.originalName ?? 'document.pdf').replace(/["\\]/g, '')}"`,
      })
      .send(f.bytes);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post(':token/accept')
  async accept(
    @Param('token') token: string,
    @Body() body: { name?: unknown; agree?: unknown },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 120)
      return this.page(res, token, 'Please enter your full name.', 400);
    if (body.agree !== 'yes' && body.agree !== true)
      return this.page(res, token, 'Please tick the box to accept.', 400);
    const r = await this.sharing.accept(token, name, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    if (!r.ok) return this.page(res, token, r.error, 409);
    // Back to the page (refreshing won't send the form again).
    res.redirect(303, `../${encodeURIComponent(token)}`);
  }
}
