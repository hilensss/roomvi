import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { GENERATION_QUEUE_JOBS, GENERATION_QUEUE_NAME } from '@roomvi/shared';
import { Job } from 'bullmq';
import { GenerationProcessingService } from '../modules/generation-processing/generation-processing.service.js';

type ProcessGenerationJobPayload = { generationJobId: string };

@Injectable()
@Processor(GENERATION_QUEUE_NAME)
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);
  constructor(
    private readonly generationProcessingService: GenerationProcessingService,
  ) {
    super();
  }
  async process(job: Job<ProcessGenerationJobPayload>) {
    if (job.name !== GENERATION_QUEUE_JOBS.PROCESS_GENERATION) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }
    this.logger.log(
      `BullMQ generation job started: bullJobId=${job.id}, generationJobId=${job.data.generationJobId}, attempt=${job.attemptsMade + 1}`,
    );

    const result = await this.generationProcessingService.processGenerationJob(
      job.data.generationJobId,
    );

    this.logger.log(
      `BullMQ generation job finished: bullJobId=${job.id}, generationJobId=${job.data.generationJobId}`,
    );

    return result;
  }
}
