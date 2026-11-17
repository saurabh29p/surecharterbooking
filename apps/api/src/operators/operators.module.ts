import { Module } from '@nestjs/common';
import { OperatorsController } from './operators.controller.js';
import { OperatorsService } from './operators.service.js';

@Module({
  controllers: [OperatorsController],
  providers: [OperatorsService],
  exports: [OperatorsService],
})
export class OperatorsModule {}
