import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: config.DESK_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  await app.listen(config.API_PORT);
  console.log(`API listening on http://localhost:${config.API_PORT}`);
}

void bootstrap();
