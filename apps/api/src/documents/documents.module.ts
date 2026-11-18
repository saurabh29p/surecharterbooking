import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module.js';
import { QuotesModule } from '../quotes/quotes.module.js';
import { AgreementsService } from './agreements.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

@Module({
  imports: [QuotesModule, BusinessProfilesModule],
  controllers: [TemplatesController, DocumentsController],
  providers: [TemplatesService, AgreementsService, DocumentsService],
  exports: [TemplatesService, AgreementsService, DocumentsService],
})
export class DocumentsModule {}
