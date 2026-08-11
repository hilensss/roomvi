import assert from 'node:assert/strict';
import test from 'node:test';
import {
  B2BAnalysisStatus,
  B2BProjectStatus,
  B2BProjectType,
  InteriorStyle,
  RoomType,
} from '@roomvi/database';

const { FloorPlanAnalysisService } = await import(
  '../dist/modules/floor-plan-analysis/floor-plan-analysis.service.js'
);
const { ReasoningAiProviderError } = await import(
  '../dist/modules/reasoning-ai/reasoning-ai-provider.interface.js'
);

function runRecord(overrides = {}) {
  return {
    id: 'analysis-1',
    status: B2BAnalysisStatus.PENDING,
    b2bProjectId: 'project-1',
    b2bProject: {
      id: 'project-1',
      type: B2BProjectType.DEVELOPER_FLOOR_PLAN,
      status: B2BProjectStatus.ANALYZING,
      sourceImageUrl: 'https://cdn.example.com/floor-plan.jpg',
      sourcePlanFileId: 'file-1',
    },
    ...overrides,
  };
}

function analyzedRoom() {
  return {
    sourceLabel: null,
    name: 'Гостиная',
    roomType: RoomType.LIVING_ROOM,
    polygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ],
    widthCm: 350,
    depthCm: 400,
    areaM2: 14,
    ceilingHeightCm: null,
    recognitionConfidence: 0.9,
    recognitionNotes: null,
    openings: [
      {
        kind: 'WINDOW',
        wallSegmentIndex: 2,
        positionRatio: 0.5,
        widthCm: 140,
        recognitionConfidence: 0.85,
      },
    ],
  };
}

test('floor-plan analysis persists reviewable rooms and completes the run atomically', async () => {
  const calls = [];
  const tx = {
    b2BRoom: {
      deleteMany: async (args) => calls.push(['rooms.deleteMany', args]),
      create: async (args) => calls.push(['rooms.create', args]),
    },
    floorPlanAnalysisRun: {
      updateMany: async (args) => {
        calls.push(['run.update', args]);
        return { count: 1 };
      },
    },
    b2BProject: {
      updateMany: async (args) => {
        calls.push(['project.update', args]);
        return { count: 1 };
      },
    },
  };
  const prisma = {
    floorPlanAnalysisRun: {
      findUnique: async () => runRecord(),
      updateMany: async (args) => {
        calls.push(['run.claim', args]);
        return { count: 1 };
      },
    },
    b2BProject: {
      updateMany: async (args) => calls.push(['project.progress', args]),
    },
    file: {
      findUnique: async () => ({
        id: 'file-1',
        storageKey: 'uploads/rooms/floor-plan.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    },
    $transaction: async (callback) => callback(tx),
  };
  const service = new FloorPlanAnalysisService(
    prisma,
    {
      loadNormalizedImage: async (file) => {
        calls.push(['asset.load', file]);
        return {
          name: 'floor-plan.jpg',
          mimeType: 'image/jpeg',
          bytes: Buffer.from('normalized-plan'),
        };
      },
    },
    {
      analyze: async () => ({
        rooms: [analyzedRoom()],
        warnings: ['Проверьте назначение комнаты'],
        provider: 'openai',
        model: 'gpt-5.6-luna',
        usage: { inputTokens: 1800, outputTokens: 420 },
      }),
    },
  );

  await service.process('analysis-1');

  const roomCreate = calls.find(([name]) => name === 'rooms.create')[1];
  assert.equal(roomCreate.data.name, 'Гостиная');
  assert.equal(roomCreate.data.styleOverride, null);
  assert.equal(roomCreate.data.openings.create[0].kind, 'WINDOW');

  const runUpdate = calls.find(([name]) => name === 'run.update')[1];
  assert.equal(runUpdate.data.status, B2BAnalysisStatus.COMPLETED);
  assert.equal(runUpdate.data.provider, 'openai');
  assert.equal(runUpdate.data.inputTokens, 1800);

  const projectUpdate = calls.find(
    ([name]) => name === 'project.update',
  )[1];
  assert.equal(
    projectUpdate.data.status,
    B2BProjectStatus.REVIEW_REQUIRED,
  );
  assert.equal(projectUpdate.data.roomsRevision.increment, 1);
});

test('a non-final failure returns the run to pending for the same queue retry', async () => {
  const calls = [];
  const prisma = {
    floorPlanAnalysisRun: {
      findUnique: async () => runRecord(),
      updateMany: async (args) => {
        calls.push(['run.updateMany', args]);
        return { count: 1 };
      },
    },
    b2BProject: {
      updateMany: async (args) => calls.push(['project.updateMany', args]),
    },
    file: {
      findUnique: async () => ({
        storageKey: 'uploads/rooms/floor-plan.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    },
  };
  const service = new FloorPlanAnalysisService(
    prisma,
    { loadNormalizedImage: async () => { throw new Error('temporary'); } },
    { analyze: async () => assert.fail('analyzer must not run') },
  );

  await assert.rejects(
    service.process('analysis-1', {
      isRecovery: false,
      isFinalAttempt: false,
    }),
    /analysis failed/i,
  );

  const retryReset = calls
    .filter(([name]) => name === 'run.updateMany')
    .at(-1)[1];
  assert.equal(retryReset.data.status, B2BAnalysisStatus.PENDING);
  assert.equal(
    calls.some(
      ([name, args]) =>
        name === 'project.updateMany' &&
        args.data.status === B2BProjectStatus.FAILED,
    ),
    false,
  );
});

test('floor-plan analysis replay is a no-op after completion', async () => {
  const service = new FloorPlanAnalysisService(
    {
      floorPlanAnalysisRun: {
        findUnique: async () =>
          runRecord({ status: B2BAnalysisStatus.COMPLETED }),
        updateMany: async () => assert.fail('completed run cannot be claimed'),
      },
    },
    {
      loadNormalizedImage: async () =>
        assert.fail('completed run cannot load its plan again'),
    },
    {
      analyze: async () =>
        assert.fail('completed run cannot call reasoning AI again'),
    },
  );

  await service.process('analysis-1');
});

test('a terminal failed run cannot be replayed over a newer analysis', async () => {
  const service = new FloorPlanAnalysisService(
    {
      floorPlanAnalysisRun: {
        findUnique: async () =>
          runRecord({ status: B2BAnalysisStatus.FAILED }),
        updateMany: async () => ({ count: 0 }),
      },
    },
    {
      loadNormalizedImage: async () =>
        assert.fail('failed run cannot load its plan again'),
    },
    {
      analyze: async () =>
        assert.fail('failed run cannot call reasoning AI again'),
    },
  );

  await assert.rejects(
    service.process('analysis-1', {
      isRecovery: true,
      isFinalAttempt: true,
    }),
    /not claimable/i,
  );
});

test('a stalled recovery claims processing with a new lease token', async () => {
  let claim;
  const service = new FloorPlanAnalysisService(
    {
      floorPlanAnalysisRun: {
        findUnique: async () =>
          runRecord({ status: B2BAnalysisStatus.PROCESSING }),
        updateMany: async (args) => {
          claim = args;
          return { count: 0 };
        },
      },
    },
    {},
    {},
  );

  await assert.rejects(
    service.process('analysis-1', {
      isRecovery: true,
      isFinalAttempt: true,
    }),
    /not claimable/i,
  );

  assert.deepEqual(claim.where.status.in, [
    B2BAnalysisStatus.PENDING,
    B2BAnalysisStatus.PROCESSING,
  ]);
  assert.equal(typeof claim.data.processingToken, 'string');
  assert.ok(claim.data.processingToken.length > 10);
});

test('floor-plan analysis records a safe terminal error on failure', async () => {
  const calls = [];
  const prisma = {
    floorPlanAnalysisRun: {
      findUnique: async () => runRecord(),
      updateMany: async () => ({ count: 1 }),
    },
    b2BProject: {
      updateMany: async (args) => calls.push(['project.failed', args]),
    },
    $transaction: async (callback) =>
      callback({
        floorPlanAnalysisRun: {
          updateMany: async (args) => {
            calls.push(['run.failed', args]);
            return { count: 1 };
          },
        },
        b2BProject: {
          updateMany: async (args) => calls.push(['project.failed', args]),
        },
      }),
  };
  const service = new FloorPlanAnalysisService(
    prisma,
    {
      loadNormalizedImage: async () => {
        throw new Error(
          'download failed for https://secret.example.com/plan.jpg',
        );
      },
    },
    { analyze: async () => assert.fail('analyzer must not be called') },
  );

  await assert.rejects(service.process('analysis-1'), /analysis failed/i);

  const runFailure = calls.find(([name]) => name === 'run.failed')[1];
  assert.equal(runFailure.data.status, B2BAnalysisStatus.FAILED);
  assert.equal(runFailure.data.errorMessage, 'Floor-plan analysis failed');
  assert.ok(
    !runFailure.data.errorMessage.includes('secret.example.com'),
  );
  const projectFailure = calls.find(
    ([name, args]) =>
      name === 'project.failed' &&
      args.data.status === B2BProjectStatus.FAILED,
  )[1];
  assert.equal(projectFailure.data.status, B2BProjectStatus.FAILED);
});

test('floor-plan analysis exposes a safe OpenAI quota error for the manager', async () => {
  const calls = [];
  const prisma = {
    floorPlanAnalysisRun: {
      findUnique: async () => runRecord(),
      updateMany: async () => ({ count: 1 }),
    },
    b2BProject: {
      updateMany: async () => ({ count: 1 }),
    },
    file: {
      findUnique: async () => ({
        storageKey: 'uploads/rooms/floor-plan.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      }),
    },
    $transaction: async (callback) =>
      callback({
        floorPlanAnalysisRun: {
          updateMany: async (args) => {
            calls.push(['run.failed', args]);
            return { count: 1 };
          },
        },
        b2BProject: {
          updateMany: async () => ({ count: 1 }),
        },
      }),
  };
  const service = new FloorPlanAnalysisService(
    prisma,
    {
      loadNormalizedImage: async () => ({
        name: 'floor-plan.jpg',
        mimeType: 'image/jpeg',
        bytes: Buffer.from('normalized-plan'),
      }),
    },
    {
      analyze: async () => {
        throw new ReasoningAiProviderError(
          'OpenAI API quota is exhausted. Configure API billing or add credits.',
          false,
          429,
          'insufficient_quota',
        );
      },
    },
  );

  await assert.rejects(
    service.process('analysis-1'),
    /OpenAI API quota is exhausted/i,
  );

  const runFailure = calls.find(([name]) => name === 'run.failed')[1];
  assert.equal(
    runFailure.data.errorMessage,
    'OpenAI API quota is exhausted. Configure API billing or add credits.',
  );
});
