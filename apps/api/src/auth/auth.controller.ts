import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { AuthService, type Session } from './auth.service.js';
import { CurrentUser, Public, type AuthUser } from './public.decorator.js';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from './tokens.js';

const LoginBody = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password').max(200),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(1, 'Enter a new password'),
});

/** Cookie-carrying endpoints also need this header: a cross-site form post can't add it (CSRF defence in depth). */
const CLIENT_HEADER = 'x-sj-client';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private setCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  }

  private respond(res: Response, session: Session) {
    this.setCookie(res, session.refreshToken);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
  }

  private requireClientHeader(req: Request) {
    if (req.header(CLIENT_HEADER) !== 'desk') throw new ForbiddenException('Missing client header');
  }

  private cookie(req: Request): string | undefined {
    const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginBody)) body: z.infer<typeof LoginBody>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(
      res,
      await this.auth.login(body.email, body.password, req.header('user-agent') ?? null),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.requireClientHeader(req);
    try {
      return this.respond(
        res,
        await this.auth.refresh(this.cookie(req), req.header('user-agent') ?? null),
      );
    } catch (err) {
      this.clearCookie(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.requireClientHeader(req);
    await this.auth.logout(this.cookie(req));
    this.clearCookie(res);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    this.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('setup-complete')
  @HttpCode(200)
  setupComplete(@CurrentUser() user: AuthUser) {
    return this.auth.completeSetup(user.id);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.auth.sessions(user.id, this.cookie(req));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.auth.revokeSession(user.id, id);
  }

  @Post('password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(ChangePasswordBody)) body: z.infer<typeof ChangePasswordBody>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
      this.cookie(req),
      req.header('user-agent') ?? null,
    );
    return this.respond(res, session);
  }
}
