import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { AppConfig } from './config.js';

/**
 * Everything both the real server and the tests need, so tests exercise the same setup.
 * All routes live under /api: in production the desk calls the API through a same-site
 * /api rewrite, so the refresh cookie is first-party (Safari blocks third-party cookies).
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix('api');
  // Gzip/brotli-sized JSON for phones on 4G. Login and session answers are left uncompressed, so a
  // token never shares a compressed response with anything the sender typed (BREACH-style guessing).
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) =>
        !(req.url ?? '').startsWith('/api/auth/') && compression.filter(req, res),
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '3mb' });
  // The website sends tap events with navigator.sendBeacon (text/plain JSON).
  app.useBodyParser('text', { limit: '4kb' });
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  // The desk (with its login cookie) and, for the public enquiry endpoints only, the website.
  app.enableCors((req: { url?: string }, cb: (e: Error | null, o: object) => void) => {
    const isPublic = (req.url ?? '').startsWith('/api/public/');
    cb(
      null,
      isPublic
        ? { origin: config.SITE_ORIGINS, credentials: false, methods: ['POST'], maxAge: 600 }
        : { origin: config.DESK_ORIGIN, credentials: true },
    );
  });
}
