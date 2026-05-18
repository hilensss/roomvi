import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GENERATION_QUEUE_NAME } from '@roomvi/shared';
import { GenerationQueueService } from './generation-queue.service.js';
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(configService.get<string>('REDIS_PORT') ?? 6379),
        },
      }),
    }),
    BullModule.registerQueue({ name: GENERATION_QUEUE_NAME }),
  ],
  providers: [GenerationQueueService],
  exports: [GenerationQueueService],
})
export class GenerationQueueModule {}
