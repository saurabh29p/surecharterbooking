import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { TodayService } from './today.service.js';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';

const SnoozeBody = z.object({ key: z.string().trim().min(3).max(200) });

@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}

  @Get()
  get() {
    return this.today.today();
  }

  /** "Later": hide one action until 7 am tomorrow. */
  @Post('snoozes')
  snooze(
    @Body(new ZodPipe(SnoozeBody)) body: z.infer<typeof SnoozeBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.today.snooze(body.key, user.id);
  }

  /** Undo "Later". */
  @Delete('snoozes/:key')
  @HttpCode(204)
  async unsnooze(@Param('key') key: string) {
    await this.today.unsnooze(key);
  }
}
