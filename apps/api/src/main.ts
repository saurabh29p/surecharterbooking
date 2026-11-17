import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.enableCors({ origin: config.DESK_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  await app.listen(config.API_PORT);
  console.log(`API listening on http://localhost:${config.API_PORT}`);
}

void bootstrap();
