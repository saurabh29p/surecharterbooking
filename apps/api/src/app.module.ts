import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from './config.js';
import { ConfigModule } from './config.module.js';
import { dataSourceOptions } from './db/data-source.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        ...dataSourceOptions(config.DATABASE_URL, config.DATABASE_SSL),
        // Production applies migrations on boot; dev/test run them explicitly.
        migrationsRun: config.NODE_ENV === 'production',
      }),
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
