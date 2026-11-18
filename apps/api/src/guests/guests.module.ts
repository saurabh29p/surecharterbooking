import { Module } from '@nestjs/common';
import { GuestIdPurgeJob } from './guest-id-purge.job.js';
import { GuestsController } from './guests.controller.js';
import { GuestsService } from './guests.service.js';

@Module({
  controllers: [GuestsController],
  providers: [GuestsService, GuestIdPurgeJob],
  exports: [GuestsService, GuestIdPurgeJob],
})
export class GuestsModule {}
