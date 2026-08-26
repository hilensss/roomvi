import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  GENERATION_QUEUE_JOBS,
  GENERATION_QUEUE_NAME,
  type AnalyzeFloorPlanJobPayload,
  type GenerationQueuePayload,
  type ProcessGenerationJobPayload,
} from '@roomvi/shared';
import type { Job } from 'bullmq';
import { GenerationProcessingService } from '../modules/generation-processing/generation-processing.service.js';
import { FloorPlanAnalysisService } from '../modules/floor-plan-analysis/floor-plan-analysis.service.js';

const DEFAULT_GENERATION_WORKER_CONCURRENCY = 2;
const MAX_GENERATION_WORKER_CONCURRENCY = 4;

export function getGenerationWorkerConcurrency(
  rawValue = process.env.GENERATION_WORKER_CONCURRENCY,
) {
  const configured = Number(rawValue ?? DEFAULT_GENERATION_WORKER_CONCURRENCY);

  if (!Number.isInteger(configured)) {
    return DEFAULT_GENERATION_WORKER_CONCURRENCY;
  }

  return Math.min(
    MAX_GENERATION_WORKER_CONCURRENCY,
    Math.max(1, configured),
  );
}

@Injectable()
@Processor(GENERATION_QUEUE_NAME, {
  concurrency: getGenerationWorkerConcurrency(),
})
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
      const analysisRunId = getPayloadId(job.data, 'analysisRunId');

      if (!analysisRunId) {
        this.logger.warn(
          `Invalid floor-plan analysis payload: bullJobId=${job.id}`,
        );
        return;
      }

      this.logger.log(
        `BullMQ floor-plan analysis started: bullJobId=${job.id}, analysisRunId=${analysisRunId}, attempt=${job.attemptsMade + 1}`,
      );
      const attempts = Number(job.opts.attempts ?? 1);
      const attemptsStarted = Number(
        job.attemptsStarted ?? job.attemptsMade + 1,
      );
      await this.floorPlanAnalysisService.process(analysisRunId, {
        isRecovery: attemptsStarted > 1,
        isFinalAttempt: job.attemptsMade + 1 >= attempts,
      });
      this.logger.log(
        `BullMQ floor-plan analysis finished: bullJobId=${job.id}, analysisRunId=${analysisRunId}`,
      );
      return { analysisRunId };
    }
    if (job.name !== GENERATION_QUEUE_JOBS.PROCESS_GENERATION) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }
    const generationJobId = getPayloadId(job.data, 'generationJobId');

    if (!generationJobId) {
      this.logger.warn(`Invalid generation payload: bullJobId=${job.id}`);
      return;
    }

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

function getPayloadId(
  payload: GenerationQueuePayload,
  key: keyof (AnalyzeFloorPlanJobPayload & ProcessGenerationJobPayload),
) {
  let value: unknown;

  if (key === 'analysisRunId' && 'analysisRunId' in payload) {
    value = payload.analysisRunId;
  }

  if (key === 'generationJobId' && 'generationJobId' in payload) {
    value = payload.generationJobId;
  }

  if (typeof value !== 'string') {
    return null;
  }

  return value.trim() || null;
}
