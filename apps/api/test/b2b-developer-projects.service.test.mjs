import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  B2BAnalysisStatus,
  B2BProjectStatus,
  B2BProjectType,
  B2BRoomStatus,
  GenerationScenario,
  InteriorStyle,
  RoomType,
} from '@roomvi/database';

const { B2BProjectsService } = await import(
  '../dist/modules/b2b-projects/b2b-projects.service.js'
);

function developerProject(overrides = {}) {
  return {
    id: 'project-1',
    type: B2BProjectType.DEVELOPER_FLOOR_PLAN,
    status: B2BProjectStatus.DRAFT,
    name: 'Квартира 12',
    partnerName: 'Новый девелопер',
    supplierId: null,
    roomType: null,
    style: InteriorStyle.MODERN,
    sourceImageUrl: null,
    sourcePlanFileId: '11111111-1111-4111-8111-111111111111',
    defaultCeilingHeightCm: 270,
    roomsRevision: 0,
    rooms: [],
    ...overrides,
  };
}

function reviewedRoom(overrides = {}) {
  return {
    id: 'room-1',
    name: 'Гостиная',
    roomType: RoomType.LIVING_ROOM,
    styleOverride: null,
    widthCm: 350,
    depthCm: 400,
    areaM2: 14,
    ceilingHeightCm: null,
    polygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ],
    recognitionConfidence: 0.9,
    recognitionNotes: null,
    sortOrder: 0,
    isIncluded: true,
    openings: [
      {
        id: 'opening-1',
        kind: 'WINDOW',
        wallSegmentIndex: 2,
        positionRatio: 0.5,
        widthCm: 140,
        recognitionConfidence: 0.8,
      },
    ],
    ...overrides,
  };
}

test('create stores a developer project without requiring a supplier', async () => {
  let createArgs;
  const service = new B2BProjectsService(
    {
      file: {
        findFirst: async () => ({
          id: '11111111-1111-4111-8111-111111111111',
          mimeType: 'image/jpeg',
        }),
      },
      b2BProject: {
        create: async (args) => {
          createArgs = args;
          return developerProject(args.data);
        },
      },
    },
    { enqueueFloorPlanAnalysis: async () => undefined },
  );

  await service.create(
    {
      type: B2BProjectType.DEVELOPER_FLOOR_PLAN,
      name: 'Квартира 12',
      partnerName: 'Новый девелопер',
      style: InteriorStyle.MODERN,
      sourcePlanFileId: '11111111-1111-4111-8111-111111111111',
      defaultCeilingHeightCm: 285,
    },
    'manager-1',
  );

  assert.equal(createArgs.data.type, B2BProjectType.DEVELOPER_FLOOR_PLAN);
  assert.equal(createArgs.data.supplierId, null);
  assert.equal(createArgs.data.roomType, null);
  assert.equal(
    createArgs.data.sourcePlanFileId,
    '11111111-1111-4111-8111-111111111111',
  );
  assert.equal(createArgs.data.sourceImageUrl, null);
  assert.equal(createArgs.data.sourcePlanPreviewUrl, null);
  assert.equal(createArgs.data.defaultCeilingHeightCm, 285);
});

test('floor plans are uploaded without exposing a permanent public URL', async () => {
  let fileCreate;
  const service = new B2BProjectsService(
    {
      file: {
        create: async (args) => {
          fileCreate = args;
          return {
            id: 'file-1',
            originalName: args.data.originalName,
            mimeType: args.data.mimeType,
            sizeBytes: args.data.sizeBytes,
          };
        },
      },
    },
    {},
    {
      uploadFile: async (input) => ({ key: input.key, url: 'https://public.example/private-plan' }),
    },
  );

  const result = await service.uploadFloorPlan(
    {
      originalname: 'plan.jpg',
      mimetype: 'image/jpeg',
      size: 4,
      buffer: Buffer.from('plan'),
    },
    'manager-1',
  );

  assert.equal(result.file.id, 'file-1');
  assert.match(
    fileCreate.data.storageKey,
    /^uploads\/private\/b2b-floor-plans\//,
  );
  assert.match(fileCreate.data.url, /^private:/);
  assert.equal(
    JSON.stringify(result).includes('public.example'),
    false,
  );
});

test('floor plans download through project authorization and storage key', async () => {
  let downloadArgs;
  const service = new B2BProjectsService(
    {
      b2BProject: {
        findFirst: async () => ({
          sourcePlanFile: {
            storageKey: 'uploads/private/b2b-floor-plans/plan.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 4,
          },
        }),
      },
    },
    {},
    {
      downloadFile: async (...args) => {
        downloadArgs = args;
        return {
          buffer: Buffer.from('plan'),
          contentType: 'image/jpeg',
          contentLength: 4,
        };
      },
    },
  );

  const result = await service.downloadFloorPlan('project-1');

  assert.deepEqual(downloadArgs, [
    'uploads/private/b2b-floor-plans/plan.jpg',
    10 * 1024 * 1024,
    10_000,
  ]);
  assert.equal(result.fileName, 'floor-plan.jpg');
});

test('startFloorPlanAnalysis claims the project and enqueues the created run', async () => {
  const calls = [];
  const tx = {
    b2BProject: {
      updateMany: async (args) => {
        calls.push(['project.claim', args]);
        return { count: 1 };
      },
    },
    floorPlanAnalysisRun: {
      create: async (args) => {
        calls.push(['run.create', args]);
        return {
          id: 'analysis-1',
          status: B2BAnalysisStatus.PENDING,
          ...args.data,
        };
      },
    },
  };
  const service = new B2BProjectsService(
    {
      b2BProject: { findUnique: async () => developerProject() },
      $transaction: async (callback) => callback(tx),
    },
    {
      enqueueFloorPlanAnalysis: async (id) =>
        calls.push(['queue.add', id]),
    },
  );

  const run = await service.startFloorPlanAnalysis('project-1');

  assert.equal(run.id, 'analysis-1');
  assert.equal(
    calls.find(([name]) => name === 'project.claim')[1].data.status,
    B2BProjectStatus.ANALYZING,
  );
  assert.deepEqual(calls.find(([name]) => name === 'queue.add'), [
    'queue.add',
    'analysis-1',
  ]);
});

test('replaceRooms rejects a stale rooms revision before deleting drafts', async () => {
  let deleted = false;
  const tx = {
    b2BProject: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () =>
        developerProject({
          status: B2BProjectStatus.REVIEW_REQUIRED,
          roomsRevision: 2,
        }),
    },
    b2BRoom: {
      deleteMany: async () => {
        deleted = true;
      },
    },
  };
  const service = new B2BProjectsService(
    {
      $transaction: async (callback) => callback(tx),
    },
    {},
  );

  await assert.rejects(
    service.replaceRooms('project-1', {
      roomsRevision: 1,
      rooms: [reviewedRoom()],
    }),
    (error) => error instanceof ConflictException,
  );
  assert.equal(deleted, false);
});

test('confirmRooms requires every included room to have type and dimensions', async () => {
  const project = developerProject({
    status: B2BProjectStatus.REVIEW_REQUIRED,
    roomsRevision: 2,
    rooms: [
      reviewedRoom({ roomType: null, widthCm: null }),
    ],
  });
  const service = new B2BProjectsService(
    {
      $transaction: async (callback) =>
        callback({
          b2BProject: {
            updateMany: async () => ({ count: 1 }),
            findUnique: async () => project,
          },
        }),
    },
    {},
  );

  await assert.rejects(
    service.confirmRooms('project-1', { roomsRevision: 2 }),
    (error) => error instanceof BadRequestException,
  );
});

test('confirmRooms atomically claims the reviewed revision before marking rooms ready', async () => {
  const calls = [];
  const project = developerProject({
    status: B2BProjectStatus.REVIEW_REQUIRED,
    roomsRevision: 3,
    rooms: [reviewedRoom()],
  });
  const tx = {
    b2BRoom: {
      updateMany: async (args) => calls.push(['rooms.update', args]),
    },
    b2BProject: {
      updateMany: async (args) => {
        calls.push(['project.claim', args]);
        return { count: 1 };
      },
      findUnique: async () => project,
      findUniqueOrThrow: async () => ({
        ...project,
        status: B2BProjectStatus.READY_TO_GENERATE,
      }),
    },
  };
  const service = new B2BProjectsService(
    {
      $transaction: async (callback) => callback(tx),
    },
    {},
  );

  await service.confirmRooms('project-1', { roomsRevision: 3 });

  const claim = calls.find(([name]) => name === 'project.claim')[1];
  assert.equal(claim.where.roomsRevision, 3);
  assert.equal(claim.data.status, B2BProjectStatus.READY_TO_GENERATE);
  assert.equal(
    calls.find(([name]) => name === 'rooms.update')[1].data.status,
    B2BRoomStatus.READY_TO_GENERATE,
  );
});

test('startGeneration creates and enqueues one developer job per included ready room', async () => {
  const rooms = [
    reviewedRoom({ id: 'room-1', sortOrder: 0 }),
    reviewedRoom({
      id: 'room-2',
      name: 'Спальня',
      roomType: RoomType.BEDROOM,
      styleOverride: InteriorStyle.SCANDI,
      sortOrder: 1,
    }),
    reviewedRoom({ id: 'room-skipped', sortOrder: 2, isIncluded: false }),
  ].map((room) => ({
    ...room,
    status: room.isIncluded
      ? B2BRoomStatus.READY_TO_GENERATE
      : B2BRoomStatus.SKIPPED,
    roomProjectId: null,
  }));
  const project = developerProject({
    status: B2BProjectStatus.READY_TO_GENERATE,
    rooms,
  });
  const createdJobs = [];
  const enqueued = [];
  let roomProjectNumber = 0;
  const tx = {
    b2BProject: {
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => project,
    },
    roomProject: {
      create: async ({ data }) => ({
        id: `room-project-${++roomProjectNumber}`,
        ...data,
      }),
    },
    generationJob: {
      create: async ({ data }) => {
        const job = { id: `job-${createdJobs.length + 1}`, ...data };
        createdJobs.push(job);
        return job;
      },
    },
    b2BRoom: {
      update: async ({ where, data }) => ({ id: where.id, ...data }),
    },
  };
  const service = new B2BProjectsService(
    {
      b2BProject: { findUnique: async () => project },
      $transaction: async (callback) => callback(tx),
    },
    {
      enqueueGeneration: async (jobId) => enqueued.push(jobId),
    },
  );

  const result = await service.startGeneration('project-1', 'manager-1');

  assert.equal(result.jobs.length, 2);
  assert.deepEqual(enqueued, ['job-1', 'job-2']);
  assert.deepEqual(
    createdJobs.map((job) => ({
      scenario: job.scenario,
      variants: job.requestedVariants,
      roomId: job.b2bRoomId,
    })),
    [
      {
        scenario: GenerationScenario.B2B_DEVELOPER_ROOM,
        variants: 1,
        roomId: 'room-1',
      },
      {
        scenario: GenerationScenario.B2B_DEVELOPER_ROOM,
        variants: 1,
        roomId: 'room-2',
      },
    ],
  );
});

test('replaceRooms rejects a self-intersecting polygon before mutating data', async () => {
  const service = new B2BProjectsService(
    {
      $transaction: async () => assert.fail('invalid geometry cannot mutate'),
    },
    {},
  );

  await assert.rejects(
    service.replaceRooms('project-1', {
      roomsRevision: 1,
      rooms: [
        reviewedRoom({
          polygon: [
            { x: 0.1, y: 0.1 },
            { x: 0.8, y: 0.8 },
            { x: 0.8, y: 0.1 },
            { x: 0.1, y: 0.8 },
          ],
        }),
      ],
    }),
    (error) => error instanceof BadRequestException,
  );
});

test('update rejects furniture-only fields on a developer project', async () => {
  const service = new B2BProjectsService(
    {
      b2BProject: { findUnique: async () => developerProject() },
    },
    {},
  );

  await assert.rejects(
    service.update('project-1', {
      supplierId: '11111111-1111-4111-8111-111111111111',
    }),
    (error) => error instanceof BadRequestException,
  );
});

test('confirmRooms rejects a stale revision before validating rooms', async () => {
  const service = new B2BProjectsService(
    {
      $transaction: async (callback) =>
        callback({
          b2BProject: {
            updateMany: async () => ({ count: 0 }),
            findUnique: async () => developerProject({ roomsRevision: 4 }),
          },
        }),
    },
    {},
  );

  await assert.rejects(
    service.confirmRooms('project-1', { roomsRevision: 3 }),
    (error) => error instanceof ConflictException,
  );
});

test('developer product replacement returns a type error before claiming the project', async () => {
  let claimed = false;
  const service = new B2BProjectsService(
    {
      $transaction: async (callback) =>
        callback({
          b2BProject: {
            findUnique: async () => developerProject(),
            updateMany: async () => {
              claimed = true;
              return { count: 1 };
            },
          },
        }),
    },
    {},
  );

  await assert.rejects(
    service.replaceProducts('project-1', [
      '11111111-1111-4111-8111-111111111111',
    ]),
    (error) => error instanceof BadRequestException,
  );
  assert.equal(claimed, false);
});
