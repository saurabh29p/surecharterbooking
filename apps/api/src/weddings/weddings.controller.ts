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
} from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  CreateWeddingBody,
  LegFields,
  LostBody,
  UpdateLegBody,
  UpdateWeddingBody,
  WeddingListQuery,
  type CreateWeddingInput,
  type LegInput,
  type UpdateLegInput,
  type UpdateWeddingInput,
  type WeddingListFilters,
} from './wedding.dto.js';
import { WeddingsService } from './weddings.service.js';

const uuid = () => new ParseUUIDPipe();

@Controller()
export class WeddingsController {
  constructor(private readonly weddings: WeddingsService) {}

  @Get('weddings')
  list(@Query(new ZodPipe(WeddingListQuery)) q: WeddingListFilters) {
    return this.weddings.list(q);
  }

  @Post('weddings')
  create(
    @Body(new ZodPipe(CreateWeddingBody)) body: CreateWeddingInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.weddings.create(body, user.id);
  }

  @Get('weddings/:id')
  get(@Param('id', uuid()) id: string) {
    return this.weddings.get(id);
  }

  @Patch('weddings/:id')
  async update(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(UpdateWeddingBody)) body: UpdateWeddingInput,
  ) {
    await this.weddings.update(id, body);
    return this.weddings.get(id);
  }

  @Post('weddings/:id/lost')
  @HttpCode(200)
  async lost(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(LostBody)) body: { reason: string },
  ) {
    await this.weddings.move(id, 'LOST', body.reason);
    return this.weddings.get(id);
  }

  @Post('weddings/:id/reopen')
  @HttpCode(200)
  async reopen(@Param('id', uuid()) id: string) {
    await this.weddings.move(id, 'ENQUIRY');
    return this.weddings.get(id);
  }

  @Post('weddings/:id/legs')
  addLeg(@Param('id', uuid()) id: string, @Body(new ZodPipe(LegFields)) body: LegInput) {
    return this.weddings.addLeg(id, body);
  }

  @Patch('legs/:legId')
  updateLeg(
    @Param('legId', uuid()) legId: string,
    @Body(new ZodPipe(UpdateLegBody)) body: UpdateLegInput,
  ) {
    return this.weddings.updateLeg(legId, body);
  }

  @Delete('legs/:legId')
  @HttpCode(204)
  deleteLeg(@Param('legId', uuid()) legId: string) {
    return this.weddings.deleteLeg(legId);
  }
}
