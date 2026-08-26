import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

const logger = new Logger('WorkerBootstrap');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  logger.log('Roomvi worker is running');
}

void bootstrap().catch((error: unknown) => {
  logger.error(
    'Roomvi worker failed to start',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
