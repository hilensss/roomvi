import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomType } from '@roomvi/database';

const blueprintModule = await import(
  '../dist/modules/generation-processing/scene-blueprint.service.js'
).catch(() => ({}));

const mediumSpatialProfile = {
  widthCm: 420,
  depthCm: 360,
  areaM2: 15.12,
  ceilingHeightCm: 270,
  aspectRatio: 1.17,
  polygonPoints: 6,
  windowPositions: ['wall:1@0.50/140cm'],
  doorPositions: ['wall:4@0.20/90cm'],
  longWallCm: 420,
  usableSolidWallCm: 330,
  circulationConstraints: [
    'keep door-to-room paths clear',
    'do not block window access',
  ],
  sizeClass: 'MEDIUM',
  source: 'REVIEWED_POLYGON',
};

const bedroomAvailability = {
  PRIMARY_ANCHOR: 5,
  STORAGE: 8,
  BEDSIDE: 4,
  TASK_LIGHTING: 6,
  AMBIENT_LIGHTING: 3,
  ACCENT_SEATING: 2,
  TEXTILE: 5,
  DECOR: 7,
};

test('blueprint structured-output schema contains scene intent and no SKU fields', () => {
  const service = new blueprintModule.SceneBlueprintService();
  const schema = service.buildResponseSchema();
  const serialized = JSON.stringify(schema);

  assert.match(serialized, /designDirection/);
  assert.match(serialized, /requiredRoles/);
  assert.match(serialized, /placementRules/);
  assert.match(serialized, /circulationRules/);
  assert.doesNotMatch(serialized, /productId|selectedProductIds|sku/i);
  assert.doesNotMatch(serialized, /chainOfThought|reasoning|explanation/i);
});

test('deterministic bedroom blueprints preserve hard roles and conceptual diversity', () => {
  const service = new blueprintModule.SceneBlueprintService();
  const blueprints = service.buildDeterministicBlueprints({
    scenario: 'MARKETPLACE',
    rooms: [
      {
        roomKey: 'bedroom-1',
        roomType: RoomType.BEDROOM,
        spatialProfile: mediumSpatialProfile,
        roleAvailability: bedroomAvailability,
      },
    ],
    variantsCount: 4,
  });

  assert.equal(blueprints.length, 4);
  assert.ok(
    blueprints.every((blueprint) =>
      blueprint.requiredRoles.includes('PRIMARY_ANCHOR'),
    ),
  );
  assert.ok(blueprints.some(({ density }) => density === 'AIRY'));
  assert.ok(blueprints.some(({ density }) => density === 'BALANCED'));
  assert.ok(blueprints.some(({ density }) => density === 'LAYERED'));
  assert.equal(new Set(blueprints.map(({ designDirection }) => designDirection)).size, 4);
  assert.ok(blueprints.every(({ designDirection }) => designDirection !== 'NORTH'));
  const airy = blueprints.find(({ density }) => density === 'AIRY');
  const layered = blueprints.find(({ density }) => density === 'LAYERED');
  assert.deepEqual(
    [airy.requiredRoles, airy.optionalRoles],
    [['PRIMARY_ANCHOR'], ['STORAGE', 'BEDSIDE', 'TEXTILE']],
  );
  assert.ok(
    layered.requiredRoles.length + layered.optionalRoles.length >
      airy.requiredRoles.length + airy.optionalRoles.length,
  );
});

test('blueprint validation repairs bedroom hard rules and removes unavailable optional roles', () => {
  const service = new blueprintModule.SceneBlueprintService();
  const [blueprint] = service.validateAndRepairBlueprints(
    {
      scenario: 'MARKETPLACE',
      rooms: [
        {
          roomKey: 'bedroom-1',
          roomType: RoomType.BEDROOM,
          spatialProfile: mediumSpatialProfile,
          roleAvailability: {
            ...bedroomAvailability,
            ACCENT_SEATING: 0,
          },
        },
      ],
      variantsCount: 1,
    },
    [
      {
        roomKey: 'bedroom-1',
        variantIndex: 1,
        designDirection: 'balanced-modern',
        density: 'BALANCED',
        zones: [{ name: 'sleep', purpose: 'sleeping zone' }],
        requiredRoles: ['ACCENT_SEATING'],
        optionalRoles: ['ACCENT_SEATING', 'TEXTILE'],
        placementRules: [],
        circulationRules: [],
      },
    ],
  );

  assert.deepEqual(blueprint.requiredRoles, ['PRIMARY_ANCHOR']);
  assert.deepEqual(blueprint.optionalRoles, ['TEXTILE']);
  assert.deepEqual(
    blueprint.circulationRules,
    mediumSpatialProfile.circulationConstraints,
  );
});

test('four marketplace blueprints with the same concept fail diversity validation', () => {
  const service = new blueprintModule.SceneBlueprintService();
  const duplicate = {
    roomKey: 'bedroom-1',
    designDirection: 'same concept',
    density: 'BALANCED',
    zones: [{ name: 'sleep', purpose: 'sleeping zone' }],
    requiredRoles: ['PRIMARY_ANCHOR'],
    optionalRoles: ['STORAGE'],
    placementRules: [
      { role: 'PRIMARY_ANCHOR', intent: 'against the main solid wall' },
    ],
    circulationRules: ['keep door-to-room paths clear'],
  };

  assert.throws(
    () =>
      service.validateAndRepairBlueprints(
        {
          scenario: 'MARKETPLACE',
          rooms: [
            {
              roomKey: 'bedroom-1',
              roomType: RoomType.BEDROOM,
              spatialProfile: mediumSpatialProfile,
              roleAvailability: bedroomAvailability,
            },
          ],
          variantsCount: 4,
        },
        Array.from({ length: 4 }, (_, index) => ({
          ...duplicate,
          variantIndex: index + 1,
        })),
      ),
    /conceptual diversity/i,
  );
});

test('small bedroom rejects a layered density blueprint', () => {
  const service = new blueprintModule.SceneBlueprintService();

  assert.throws(
    () =>
      service.validateAndRepairBlueprints(
        {
          scenario: 'MARKETPLACE',
          rooms: [
            {
              roomKey: 'small-bedroom',
              roomType: RoomType.BEDROOM,
              spatialProfile: {
                ...mediumSpatialProfile,
                areaM2: 8,
                sizeClass: 'SMALL',
              },
              roleAvailability: bedroomAvailability,
            },
          ],
          variantsCount: 1,
        },
        [
          {
            roomKey: 'small-bedroom',
            variantIndex: 1,
            designDirection: 'dense bedroom',
            density: 'LAYERED',
            zones: [{ name: 'sleep', purpose: 'sleeping zone' }],
            requiredRoles: ['PRIMARY_ANCHOR'],
            optionalRoles: ['STORAGE', 'BEDSIDE', 'TEXTILE', 'DECOR'],
            placementRules: [],
            circulationRules: [],
          },
        ],
      ),
    /density/i,
  );
});
