import { Module } from '@nestjs/common';
import { PartnersModule } from '../partners/partners.module.js';
import { EnquiriesService } from './enquiries.service.js';
import { EnquiriesController, PublicEnquiriesController } from './public-enquiries.controller.js';

@Module({
  imports: [PartnersModule],
  controllers: [PublicEnquiriesController, EnquiriesController],
  providers: [EnquiriesService],
})
export class EnquiriesModule {}
