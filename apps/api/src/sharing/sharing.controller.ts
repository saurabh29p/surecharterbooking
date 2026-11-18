import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { SHARE_CHANNELS } from '@shubhjets/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { optionalText } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { SharingService } from './sharing.service.js';

const uuid = () => new ParseUUIDPipe();
const LinkBody = z.object({
  channel: z.enum(SHARE_CHANNELS),
  recipient: optionalText(200),
  phone: optionalText(30),
  email: optionalText(200),
  message: optionalText(4000),
  subject: optionalText(200),
});

const EmailBody = z.object({
  to: z.string().trim().email('Enter an email address'),
  message: optionalText(4000),
  subject: optionalText(200),
});

@Controller()
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  /** The ready-made message (with {link}), subject and usual recipient. */
  @Get('documents/:id/share')
  prepare(@Param('id', uuid()) id: string) {
    return this.sharing.prepare(id);
  }

  /** A new secure link for one share; returns the final message and WhatsApp/Telegram/email links. */
  @Post('documents/:id/share-links')
  create(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(LinkBody)) body: z.infer<typeof LinkBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sharing.createLink(id, body, user.id);
  }

  /** Email from the app with the PDF attached (409 EMAIL_NOT_CONFIGURED until Resend is set up). */
  @Post('documents/:id/email')
  email(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(EmailBody)) body: z.infer<typeof EmailBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sharing.email(id, body, user.id);
  }

  @Get('documents/:id/shares')
  list(@Param('id', uuid()) id: string) {
    return this.sharing.list(id);
  }

  @Post('shares/:id/revoke')
  @HttpCode(204)
  async revoke(@Param('id', uuid()) id: string) {
    await this.sharing.revoke(id);
  }
}
