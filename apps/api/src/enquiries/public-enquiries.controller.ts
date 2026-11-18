import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  EnquiryBody,
  PartnerSignupBody,
  TapBody,
  type EnquiryInput,
  type PartnerSignupInput,
} from './enquiry.dto.js';
import { EnquiriesService } from './enquiries.service.js';

/**
 * What the public website (shubhjets.com) posts to. No login; rate-limited per network; the
 * website's origin is allowed by CORS for /api/public/* only (see app.setup.ts).
 */
@Public()
@Controller('public')
export class PublicEnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Throttle({ default: { limit: 8, ttl: 10 * 60_000 } })
  @Post('enquiries')
  submit(@Body(new ZodPipe(EnquiryBody)) body: EnquiryInput, @Req() req: Request) {
    return this.enquiries.submit(body, req.ip);
  }

  @Throttle({ default: { limit: 8, ttl: 10 * 60_000 } })
  @Post('partners')
  partner(@Body(new ZodPipe(PartnerSignupBody)) body: PartnerSignupInput, @Req() req: Request) {
    return this.enquiries.partnerSignup(body, req.ip);
  }

  /** WhatsApp / call taps, sent with navigator.sendBeacon (a text/plain JSON body). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('events')
  @HttpCode(204)
  async event(@Body() raw: unknown, @Req() req: Request) {
    let value = raw;
    if (typeof raw === 'string') {
      try {
        value = JSON.parse(raw);
      } catch {
        throw new BadRequestException('Send JSON');
      }
    }
    const body = new ZodPipe(TapBody).transform(value);
    await this.enquiries.tap(body, req.ip);
  }
}

/** Website activity in the desk. */
@Controller()
export class EnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Get('weddings/:id/enquiry')
  async forWedding(@Param('id', ParseUUIDPipe) id: string) {
    return { enquiry: await this.enquiries.forWedding(id) };
  }

  @Get('enquiries/summary')
  summary(@Query('days') days?: string) {
    const n = Number(days ?? 30);
    return this.enquiries.summary(Number.isInteger(n) && n >= 1 && n <= 366 ? n : 30);
  }
}
