import assert from 'node:assert/strict';
import test from 'node:test';

const { getGenerationWorkerConcurrency } = await import(
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
