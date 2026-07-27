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
      update: async (args) => calls.push(['run.update', args]),
    },
    b2BProject: {
      update: async (args) => calls.push(['project.update', args]),
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
    $transaction: async (callback) => callback(tx),
  };
  const service = new FloorPlanAnalysisService(
    prisma,
    {
      loadNormalizedImage: async (url) => {
        calls.push(['asset.load', url]);
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

test('floor-plan analysis records a safe terminal error on failure', async () => {
  const calls = [];
  const prisma = {
    floorPlanAnalysisRun: {
      findUnique: async () => runRecord(),
      updateMany: async () => ({ count: 1 }),
      update: async (args) => calls.push(['run.failed', args]),
    },
    b2BProject: {
      updateMany: async (args) => calls.push(['project.failed', args]),
    },
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
