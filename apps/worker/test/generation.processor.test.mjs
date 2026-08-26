import assert from 'node:assert/strict';
import test from 'node:test';
import { GENERATION_QUEUE_JOBS } from '@roomvi/shared';

const { GenerationProcessor, getGenerationWorkerConcurrency } = await import(
  '../dist/processors/generation.processor.js'
);

test('generation worker concurrency defaults to two and stays bounded', () => {
  assert.equal(getGenerationWorkerConcurrency(undefined), 2);
  assert.equal(getGenerationWorkerConcurrency('1'), 1);
  assert.equal(getGenerationWorkerConcurrency('3'), 3);
  assert.equal(getGenerationWorkerConcurrency('50'), 4);
  assert.equal(getGenerationWorkerConcurrency('0'), 1);
  assert.equal(getGenerationWorkerConcurrency('invalid'), 2);
});

test('generation processor discards malformed queue payloads safely', async () => {
  let generationCalls = 0;
  let analysisCalls = 0;
  const processor = new GenerationProcessor(
    {
      processGenerationJob: async () => {
        generationCalls += 1;
      },
    },
    {
      process: async () => {
        analysisCalls += 1;
      },
    },
  );

  await processor.process({
    id: 'invalid-generation',
    name: GENERATION_QUEUE_JOBS.PROCESS_GENERATION,
    data: { generationJobId: '   ' },
  });
  await processor.process({
    id: 'invalid-analysis',
    name: GENERATION_QUEUE_JOBS.ANALYZE_FLOOR_PLAN,
    data: { analysisRunId: '' },
  });

  assert.equal(generationCalls, 0);
  assert.equal(analysisCalls, 0);
});
