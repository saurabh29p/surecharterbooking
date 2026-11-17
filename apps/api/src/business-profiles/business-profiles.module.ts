import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessProfile } from './business-profile.entity.js';
import { BusinessProfilesController } from './business-profiles.controller.js';
import { BusinessProfilesService } from './business-profiles.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessProfile])],
  controllers: [BusinessProfilesController],
  providers: [BusinessProfilesService],
  exports: [BusinessProfilesService],
})
export class BusinessProfilesModule {}
