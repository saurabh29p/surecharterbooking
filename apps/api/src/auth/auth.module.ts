import { Inject, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginLimiter } from './login-limiter.js';
import { RefreshToken } from './refresh-token.entity.js';
import { User } from './user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, RefreshToken])],
  controllers: [AuthController],
  providers: [AuthService, LoginLimiter, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService],
})
export class AuthModule implements OnApplicationBootstrap {
  private readonly log = new Logger('Auth');

  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** On a fresh database (e.g. first Railway deploy) create the owner from ADMIN_EMAIL / ADMIN_PASSWORD. */
  async onApplicationBootstrap() {
    if (this.config.NODE_ENV === 'production') {
      const disabled = await this.auth.disableDemoAccounts();
      if (disabled.length)
        this.log.error(`Demo accounts found in production and disabled: ${disabled.join(', ')}`);
    }
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = this.config;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || this.config.NODE_ENV === 'test') return;
    const result = await this.auth.bootstrapAdmin(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (result === 'created') this.log.log(`Created the owner account for ${ADMIN_EMAIL}`);
  }
}
