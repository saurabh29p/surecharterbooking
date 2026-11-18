import { Module } from '@nestjs/common';
import { PartnersModule } from '../partners/partners.module.js';
import { ExportsService } from './exports.service.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [PartnersModule],
  controllers: [ImportsController],
  providers: [ImportsService, ExportsService],
})
export class ImportsModule {}
