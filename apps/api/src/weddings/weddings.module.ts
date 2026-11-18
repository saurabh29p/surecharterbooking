import { Module } from '@nestjs/common';
import { WeddingsController } from './weddings.controller.js';
import { WeddingsService } from './weddings.service.js';

@Module({
  controllers: [WeddingsController],
  providers: [WeddingsService],
  exports: [WeddingsService],
})
export class WeddingsModule {}
