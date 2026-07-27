import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomType } from '@roomvi/database';

const { FloorPlanAnalyzerService } = await import(
  '../dist/modules/floor-plan-analysis/floor-plan-analyzer.service.js'
);

function proposal(overrides = {}) {
  return {
    sourceLabel: '3 488',
    suggestedName: 'Гостиная',
    roomType: 'LIVING_ROOM',
    polygon: [
      { x: 0.35, y: 0.08 },
      { x: 0.7, y: 0.08 },
      { x: 0.7, y: 0.55 },
      { x: 0.35, y: 0.55 },
    ],
    widthCm: 348,
    depthCm: 386,
    areaM2: 13.4,
    ceilingHeightCm: null,
    confidence: 0.91,
    notes: null,
    openings: [
      {
        kind: 'WINDOW',
        wallSegmentIndex: 2,
        positionRatio: 0.55,
        widthCm: 140,
        confidence: 0.88,
      },
    ],
    ...overrides,
  };
}

function analyzerFor(data) {
  return new FloorPlanAnalyzerService({
    generateStructured: async (request) => ({
      data,
      provider: 'openai',
      model: 'gpt-5.6-luna',
      usage: { inputTokens: 1500, outputTokens: 300 },
      request,
    }),
  });
}

const attachment = {
  name: 'plan.jpg',
  mimeType: 'image/jpeg',
  bytes: Buffer.from('floor-plan'),
};

test('floor-plan analyzer keeps usable room geometry and valid wall openings', async () => {
  const result = await analyzerFor({ rooms: [proposal()] }).analyze(
    attachment,
  );

  assert.equal(result.rooms.length, 1);
  assert.equal(result.rooms[0].roomType, RoomType.LIVING_ROOM);
  assert.deepEqual(result.rooms[0].polygon[0], { x: 0.35, y: 0.08 });
  assert.deepEqual(result.rooms[0].openings, [
    {
      kind: 'WINDOW',
      wallSegmentIndex: 2,
      positionRatio: 0.55,
      widthCm: 140,
      recognitionConfidence: 0.88,
    },
  ]);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-5.6-luna');
  assert.deepEqual(result.usage, {
    inputTokens: 1500,
    outputTokens: 300,
  });
});

test('floor-plan analyzer clears an uncertain or unsupported room type for review', async () => {
  const result = await analyzerFor({
    rooms: [
      proposal({
        roomType: 'GARAGE',
        confidence: 0.3,
        sourceLabel: null,
        suggestedName: '',
      }),
    ],
  }).analyze(attachment);

  assert.equal(result.rooms[0].roomType, null);
  assert.equal(result.rooms[0].name, 'Комната 1');
  assert.match(result.rooms[0].recognitionNotes, /тип комнаты/i);
});

test('floor-plan analyzer discards invalid openings and nulls impossible dimensions', async () => {
  const result = await analyzerFor({
    rooms: [
      proposal({
        widthCm: -1,
        depthCm: 90_000,
        areaM2: 0,
        ceilingHeightCm: 80,
        openings: [
          {
            kind: 'WINDOW',
            wallSegmentIndex: 8,
            positionRatio: 1.4,
            widthCm: -3,
            confidence: 0.8,
          },
        ],
      }),
    ],
  }).analyze(attachment);

  assert.equal(result.rooms[0].widthCm, null);
  assert.equal(result.rooms[0].depthCm, null);
  assert.equal(result.rooms[0].areaM2, null);
  assert.equal(result.rooms[0].ceilingHeightCm, null);
  assert.deepEqual(result.rooms[0].openings, []);
  assert.match(result.rooms[0].recognitionNotes, /размер/i);
  assert.ok(result.warnings.length > 0);
});

test('floor-plan analyzer rejects structurally unusable and duplicate room polygons', async () => {
  const result = await analyzerFor({
    rooms: [
      proposal({
        polygon: [
          { x: 0.2, y: 0.2 },
          { x: 0.2, y: 0.2 },
          { x: 1.4, y: 0.3 },
        ],
      }),
      proposal(),
      proposal({ suggestedName: 'Дубликат' }),
    ],
  }).analyze(attachment);

  assert.equal(result.rooms.length, 1);
  assert.equal(result.rooms[0].name, 'Гостиная');
  assert.ok(result.warnings.some((warning) => /отброшена/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /дубликат/i.test(warning)));
});
