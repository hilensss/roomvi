import assert from 'node:assert/strict';
import test from 'node:test';
import { GENERATION_QUEUE_JOBS } from '@roomvi/shared';

const { GenerationQueueService } = await import(
  '../dist/modules/generation-queue/generation-queue.service.js'
);

test('analysis queue enqueues one bounded floor-plan job', async () => {
  let queued;
  const service = new GenerationQueueService({
    add: async (...args) => {
      queued = args;
      return { id: 'bull-job-1' };
    },
  });

  await service.enqueueFloorPlanAnalysis('analysis-run-1');

  assert.equal(queued[0], GENERATION_QUEUE_JOBS.ANALYZE_FLOOR_PLAN);
  assert.deepEqual(queued[1], { analysisRunId: 'analysis-run-1' });
  assert.equal(queued[2].attempts, 2);
  assert.deepEqual(queued[2].backoff, {
    type: 'exponential',
    delay: 5000,
  });
  assert.deepEqual(queued[2].removeOnComplete, { age: 86400, count: 1000 });
  assert.deepEqual(queued[2].removeOnFail, { age: 604800, count: 5000 });
});
