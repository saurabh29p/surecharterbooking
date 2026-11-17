import { Module } from '@nestjs/common';
import { OperatorsModule } from '../operators/operators.module.js';
import { JobsService } from './jobs.service.js';
import { OperatorExpiryJob } from './operator-expiry.job.js';

@Module({
  imports: [OperatorsModule],
  providers: [JobsService, OperatorExpiryJob],
  exports: [JobsService, OperatorExpiryJob],
})
export class JobsModule {}
