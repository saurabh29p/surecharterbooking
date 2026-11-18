import { Module } from '@nestjs/common';
import { BusinessProfilesModule } from '../business-profiles/business-profiles.module.js';
import { OperatorsModule } from '../operators/operators.module.js';
import { QuoteDocumentsService } from './quote-documents.service.js';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';

@Module({
  imports: [OperatorsModule, BusinessProfilesModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuoteDocumentsService],
  exports: [QuotesService],
})
export class QuotesModule {}
