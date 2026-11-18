import { Global, Module } from '@nestjs/common';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { ConsentService } from './consent.service.js';

@Global()
@Module({
  controllers: [ClientsController],
  providers: [ClientsService, ConsentService],
  exports: [ClientsService, ConsentService],
})
export class ClientsModule {}
