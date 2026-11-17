import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { IsNull, type Repository } from 'typeorm';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { setRequestUser } from '../audit/request-context.js';
import { IS_PUBLIC, type AuthUser } from './public.decorator.js';
import { verifyAccessToken } from './tokens.js';
import { User } from './user.entity.js';

/**
 * Every route needs a valid access token unless marked @Public().
 * The user's token_version is checked on each request, so "log out all devices" takes effect at once.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]))
      return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Please log in');
    let claims;
    try {
      claims = await verifyAccessToken(token, this.config.JWT_SECRET);
    } catch {
      throw new UnauthorizedException('Your session has expired');
    }
    const user = await this.users.findOne({
      where: { id: claims.sub, disabledAt: IsNull() },
      select: { id: true, role: true, tokenVersion: true },
    });
    if (!user || user.tokenVersion !== claims.ver)
      throw new UnauthorizedException('Your session has ended');
    req.user = { id: user.id, role: user.role };
    setRequestUser(user.id);
    return true;
  }
}
