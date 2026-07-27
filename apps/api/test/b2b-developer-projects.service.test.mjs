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
    sourceImageUrl: 'https://cdn.example.com/floor-plan.jpg',
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
      sourceImageUrl: 'https://cdn.example.com/floor-plan.jpg',
      defaultCeilingHeightCm: 285,
    },
    'manager-1',
  );

  assert.equal(createArgs.data.type, B2BProjectType.DEVELOPER_FLOOR_PLAN);
  assert.equal(createArgs.data.supplierId, null);
  assert.equal(createArgs.data.roomType, null);
  assert.equal(createArgs.data.defaultCeilingHeightCm, 285);
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
  const service = new B2BProjectsService(
    {
      b2BProject: {
        findUnique: async () =>
          developerProject({
            status: B2BProjectStatus.REVIEW_REQUIRED,
            rooms: [
              reviewedRoom({ roomType: null, widthCm: null }),
            ],
          }),
      },
    },
    {},
  );

  await assert.rejects(
    service.confirmRooms('project-1'),
    (error) => error instanceof BadRequestException,
  );
});

test('confirmRooms marks included valid rooms and the project ready', async () => {
  const calls = [];
  const project = developerProject({
    status: B2BProjectStatus.REVIEW_REQUIRED,
    rooms: [reviewedRoom()],
  });
  const tx = {
    b2BRoom: {
      updateMany: async (args) => calls.push(['rooms.update', args]),
    },
    b2BProject: {
      update: async (args) => {
        calls.push(['project.update', args]);
        return {
          ...project,
          status: B2BProjectStatus.READY_TO_GENERATE,
        };
      },
    },
  };
  const service = new B2BProjectsService(
    {
      b2BProject: { findUnique: async () => project },
      $transaction: async (callback) => callback(tx),
    },
    {},
  );

  await service.confirmRooms('project-1');

  assert.equal(
    calls.find(([name]) => name === 'rooms.update')[1].data.status,
    B2BRoomStatus.READY_TO_GENERATE,
  );
  assert.equal(
    calls.find(([name]) => name === 'project.update')[1].data.status,
    B2BProjectStatus.READY_TO_GENERATE,
  );
});
