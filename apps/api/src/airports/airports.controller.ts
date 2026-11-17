import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Airport } from './airport.entity.js';

@Controller('airports')
export class AirportsController {
  constructor(@InjectRepository(Airport) private readonly repo: Repository<Airport>) {}

  @Get()
  list() {
    return this.repo.find({ order: { city: 'ASC' } });
  }
}
