import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { AppConfig } from './config.js';

/**
 * Everything both the real server and the tests need, so tests exercise the same setup.
 * All routes live under /api: in production the desk calls the API through a same-site
 * /api rewrite, so the refresh cookie is first-party (Safari blocks third-party cookies).
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.enableCors({ origin: config.DESK_ORIGIN, credentials: true });
}
