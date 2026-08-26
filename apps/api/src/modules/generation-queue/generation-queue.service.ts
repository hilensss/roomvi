import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  GENERATION_QUEUE_JOBS,
  GENERATION_QUEUE_NAME,
  type AnalyzeFloorPlanJobPayload,
  type GenerationQueuePayload,
  type ProcessGenerationJobPayload,
} from '@roomvi/shared';
import { Queue } from 'bullmq';

@Injectable()
export class GenerationQueueService {
  constructor(
    @InjectQueue(GENERATION_QUEUE_NAME)
    private readonly generationQueue: Queue<GenerationQueuePayload>,
  ) {}
  async enqueueGeneration(generationJobId: string) {
    return this.generationQueue.add(
      GENERATION_QUEUE_JOBS.PROCESS_GENERATION,
      { generationJobId } satisfies ProcessGenerationJobPayload,
      {
        attempts: 1, // Provider retries are scoped to each variant in the worker.
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    );
  }

  async enqueueFloorPlanAnalysis(analysisRunId: string) {
    return this.generationQueue.add(
      GENERATION_QUEUE_JOBS.ANALYZE_FLOOR_PLAN,
      { analysisRunId } satisfies AnalyzeFloorPlanJobPayload,
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    );
  }
}
