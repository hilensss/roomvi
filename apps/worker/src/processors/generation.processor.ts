import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { GENERATION_QUEUE_JOBS, GENERATION_QUEUE_NAME } from '@roomvi/shared';
import { Job } from 'bullmq';
import { GenerationProcessingService } from '../modules/generation-processing/generation-processing.service.js';
import { FloorPlanAnalysisService } from '../modules/floor-plan-analysis/floor-plan-analysis.service.js';

type GenerationQueuePayload =
  | { generationJobId: string }
  | { analysisRunId: string };

@Injectable()
@Processor(GENERATION_QUEUE_NAME)
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);
  constructor(
    private readonly generationProcessingService: GenerationProcessingService,
    private readonly floorPlanAnalysisService: FloorPlanAnalysisService,
  ) {
    super();
  }
  async process(job: Job<GenerationQueuePayload>) {
    if (job.name === GENERATION_QUEUE_JOBS.ANALYZE_FLOOR_PLAN) {
      const analysisRunId = (
        job.data as { analysisRunId: string }
      ).analysisRunId;
      this.logger.log(
        `BullMQ floor-plan analysis started: bullJobId=${job.id}, analysisRunId=${analysisRunId}, attempt=${job.attemptsMade + 1}`,
      );
      await this.floorPlanAnalysisService.process(analysisRunId);
      this.logger.log(
        `BullMQ floor-plan analysis finished: bullJobId=${job.id}, analysisRunId=${analysisRunId}`,
      );
      return { analysisRunId };
    }
    if (job.name !== GENERATION_QUEUE_JOBS.PROCESS_GENERATION) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }
    const generationJobId = (
      job.data as { generationJobId: string }
    ).generationJobId;
    this.logger.log(
      `BullMQ generation job started: bullJobId=${job.id}, generationJobId=${generationJobId}, attempt=${job.attemptsMade + 1}`,
    );

    const result = await this.generationProcessingService.processGenerationJob(
      generationJobId,
    );

    this.logger.log(
      `BullMQ generation job finished: bullJobId=${job.id}, generationJobId=${generationJobId}`,
    );

    return result;
  }
}
