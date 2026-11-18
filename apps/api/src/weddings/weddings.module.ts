import { Module } from '@nestjs/common';
import { OperatorsModule } from '../operators/operators.module.js';
import { RatesController } from './rates.controller.js';
import { RatesService } from './rates.service.js';
import { WeddingsController } from './weddings.controller.js';
import { WeddingsService } from './weddings.service.js';

@Module({
  imports: [OperatorsModule],
  controllers: [WeddingsController, RatesController],
  providers: [WeddingsService, RatesService],
  exports: [WeddingsService, RatesService],
})
export class WeddingsModule {}
