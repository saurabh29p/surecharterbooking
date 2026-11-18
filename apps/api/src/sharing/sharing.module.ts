import { Module } from '@nestjs/common';
import { QuotesModule } from '../quotes/quotes.module.js';
import { PublicShareController } from './public-share.controller.js';
import { SharingController } from './sharing.controller.js';
import { SharingService } from './sharing.service.js';

@Module({
  imports: [QuotesModule],
  controllers: [SharingController, PublicShareController],
  providers: [SharingService],
  exports: [SharingService],
})
export class SharingModule {}
