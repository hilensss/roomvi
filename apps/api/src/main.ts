import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

const logger = new Logger('ApiBootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.API_CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  logger.log(`API is running on port ${port}`);
}

void bootstrap().catch((error: unknown) => {
  logger.error(
    'API failed to start',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
