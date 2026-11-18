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
  Query,
  UploadedFile,
} from '@nestjs/common';
import { PARTNER_STATUSES } from '@shubhjets/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { optionalDate } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AcceptFile, requireFile } from '../files/upload.js';
import {
  ActivityBody,
  PartnerFields,
  PartnerListQuery,
  UpdatePartnerBody,
  type ActivityInput,
  type PartnerInput,
  type PartnerListFilters,
  type UpdatePartnerInput,
} from './partner.dto.js';
import { PartnersService } from './partners.service.js';

const uuid = () => new ParseUUIDPipe();
const UndoBody = z.object({
  restoreStatus: z.enum(PARTNER_STATUSES as [string, ...string[]]).optional(),
  restoreFollowUpOn: optionalDate,
});

@Controller()
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get('partners')
  list(@Query(new ZodPipe(PartnerListQuery)) q: PartnerListFilters) {
    return this.partners.list(q);
  }

  @Post('partners')
  create(@Body(new ZodPipe(PartnerFields)) body: PartnerInput, @CurrentUser() user: AuthUser) {
    return this.partners.create(body, user.id);
  }

  @Get('partners/:id')
  get(@Param('id', uuid()) id: string) {
    return this.partners.get(id);
  }

  @Patch('partners/:id')
  async update(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(UpdatePartnerBody)) body: UpdatePartnerInput,
  ) {
    await this.partners.update(id, body);
    return this.partners.get(id);
  }

  @Post('partners/:id/activities')
  addActivity(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(ActivityBody)) body: ActivityInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.partners.addActivity(id, body, user.id);
  }

  /** Undo a quick activity (the desk's Undo button). */
  @Delete('partner-activities/:activityId')
  @HttpCode(204)
  undoActivity(
    @Param('activityId', uuid()) activityId: string,
    @Body(new ZodPipe(UndoBody)) body: z.infer<typeof UndoBody>,
  ) {
    return this.partners.undoActivity(activityId, {
      status: body.restoreStatus as never,
      nextFollowUpOn: body.restoreFollowUpOn,
    });
  }

  @Post('partners/:id/referral-agreement')
  @HttpCode(200)
  @AcceptFile()
  async referral(
    @Param('id', uuid()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const f = requireFile(file);
    await this.partners.setReferralAgreement(id, {
      buffer: f.buffer,
      originalName: f.originalname,
    });
    return this.partners.get(id);
  }

  @Delete('partners/:id/referral-agreement')
  async removeReferral(@Param('id', uuid()) id: string) {
    await this.partners.removeReferralAgreement(id);
    return this.partners.get(id);
  }
}
