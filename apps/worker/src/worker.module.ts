import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GENERATION_QUEUE_NAME } from '@roomvi/shared';
import { CatalogReadModule } from './modules/catalog/catalog-read.module.js';
import { GenerationProcessingModule } from './modules/generation-processing/generation-processing.module.js';
import { FloorPlanAnalysisModule } from './modules/floor-plan-analysis/floor-plan-analysis.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { GenerationProcessor } from './processors/generation.processor.js';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
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
    PrismaModule,
    CatalogReadModule,
    GenerationProcessingModule,
    FloorPlanAnalysisModule,
  ],
  providers: [GenerationProcessor],
})
export class WorkerModule {}
