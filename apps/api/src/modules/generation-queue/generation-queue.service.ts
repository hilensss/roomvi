import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { GENERATION_QUEUE_JOBS, GENERATION_QUEUE_NAME } from '@roomvi/shared';
import { Queue } from 'bullmq';
export type ProcessGenerationJobPayload = { generationJobId: string };
@Injectable()
export class GenerationQueueService {
  constructor(
    @InjectQueue(GENERATION_QUEUE_NAME)
    private readonly generationQueue: Queue<ProcessGenerationJobPayload>,
  ) {}
  async enqueueGeneration(generationJobId: string) {
    return this.generationQueue.add(
      GENERATION_QUEUE_JOBS.PROCESS_GENERATION,
      { generationJobId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    );
  }
}
