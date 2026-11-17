import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Airport } from './airport.entity.js';
import { AirportsController } from './airports.controller.js';

@Module({ imports: [TypeOrmModule.forFeature([Airport])], controllers: [AirportsController] })
export class AirportsModule {}
