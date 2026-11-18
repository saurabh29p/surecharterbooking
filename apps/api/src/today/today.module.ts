import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { TodayController } from './today.controller.js';
import { TodayService } from './today.service.js';

@Module({
  imports: [PaymentsModule, BusinessProfilesModule],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
