import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
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
    // Default limit per client IP; stricter limits are set per route (e.g. login).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      errorMessage: 'Too many requests. Please wait a few minutes and try again.',
    }),
    AuditModule,
    AuthModule,
  ],
  controllers: [HealthController],
  // Throttle first, then require login (JwtAuthGuard is registered in AuthModule).
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
