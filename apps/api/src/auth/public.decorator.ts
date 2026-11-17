import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Opt a route out of login (health check, login itself, public share pages, website enquiries). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AuthUser {
  id: string;
  role: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentUser used on a public route');
  return req.user;
});
