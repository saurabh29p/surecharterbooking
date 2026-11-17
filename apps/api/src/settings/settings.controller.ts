import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { SettingsService } from './settings.service.js';

const UpdateBody = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  confirmGst: z.boolean().optional(),
});

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  view() {
    return this.settings.view();
  }

  @Patch()
  update(
    @Body(new ZodPipe(UpdateBody)) body: z.infer<typeof UpdateBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.settings.update(body, user.id);
  }
}
