import { Module } from '@nestjs/common';
import { GuestsModule } from '../guests/guests.module.js';
import { OperatorsModule } from '../operators/operators.module.js';
import { JobsService } from './jobs.service.js';
import { OperatorExpiryJob } from './operator-expiry.job.js';

@Module({
  imports: [OperatorsModule, GuestsModule],
  providers: [JobsService, OperatorExpiryJob],
  exports: [JobsService, OperatorExpiryJob],
})
export class JobsModule {}
