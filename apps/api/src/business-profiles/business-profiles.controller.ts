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
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AcceptFile, requireFile } from '../files/upload.js';
import {
  CreateProfileBody,
  UpdateProfileBody,
  type CreateProfileInput,
  type UpdateProfileInput,
} from './business-profile.dto.js';
import { BusinessProfilesService } from './business-profiles.service.js';

@Controller('business-profiles')
export class BusinessProfilesController {
  constructor(private readonly profiles: BusinessProfilesService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string) {
    return this.profiles.list(includeArchived === 'true');
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.profiles.get(id);
  }

  @Post()
  create(
    @Body(new ZodPipe(CreateProfileBody)) body: CreateProfileInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.profiles.create(body, user.id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(UpdateProfileBody)) body: UpdateProfileInput,
  ) {
    return this.profiles.update(id, body);
  }

  @Post(':id/default')
  @HttpCode(200)
  setDefault(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.profiles.setDefault(id);
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.profiles.archive(id);
  }

  /** Full bank details for the edit form; audited. */
  @Get(':id/bank-details')
  async bankDetails(@Param('id', new ParseUUIDPipe()) id: string) {
    return { bankDetails: await this.profiles.revealBankDetails(id) };
  }

  /** Upload a logo (PNG, JPG or WebP, up to 2 MB) for PDFs from this profile. */
  @Post(':id/logo')
  @HttpCode(200)
  @AcceptFile()
  setLogo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const f = requireFile(file);
    return this.profiles.setLogo(id, { buffer: f.buffer, originalName: f.originalname });
  }

  @Delete(':id/logo')
  removeLogo(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.profiles.removeLogo(id);
  }
}
