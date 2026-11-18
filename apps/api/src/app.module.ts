import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirportsModule } from './airports/airports.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BusinessProfilesModule } from './business-profiles/business-profiles.module.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { ConfigModule } from './config.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { dataSourceOptions } from './db/data-source.js';
import { FilesModule } from './files/files.module.js';
import { HealthController } from './health.controller.js';
import { ImportsModule } from './imports/imports.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { WeddingsModule } from './weddings/weddings.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { PdfModule } from './pdf/pdf.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { GuestsModule } from './guests/guests.module.js';
import { SharingModule } from './sharing/sharing.module.js';
import { EmailModule } from './email/email.module.js';
import { OperatorsModule } from './operators/operators.module.js';
import { PartnersModule } from './partners/partners.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { SettingsModule } from './settings/settings.module.js';

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
    CryptoModule,
    FilesModule,
    PdfModule,
    SettingsModule,
    AuthModule,
    AirportsModule,
    BusinessProfilesModule,
    OperatorsModule,
    ClientsModule,
    PartnersModule,
    JobsModule,
    ImportsModule,
    WeddingsModule,
    QuotesModule,
    DocumentsModule,
    InvoicesModule,
    PaymentsModule,
    GuestsModule,
    EmailModule,
    SharingModule,
  ],
  controllers: [HealthController],
  // Throttle first, then require login (JwtAuthGuard is registered in AuthModule).
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
