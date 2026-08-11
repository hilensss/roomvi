import assert from 'node:assert/strict';
import test from 'node:test';

const { RoomSpatialProfileService } = await import(
  '../dist/modules/generation-processing/room-spatial-profile.service.js'
);

test('builds a deterministic reviewed spatial profile with openings and circulation', () => {
  const service = new RoomSpatialProfileService();
  const profile = service.build({
    widthCm: 200,
    depthCm: 500,
    ceilingHeightCm: 270,
    polygon: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    openings: [
      { kind: 'WINDOW', wallSegmentIndex: 1, positionRatio: 0.5, widthCm: 140 },
      { kind: 'DOOR', wallSegmentIndex: 3, positionRatio: 0.2, widthCm: 90 },
    ],
  });

  assert.equal(profile.source, 'REVIEWED_POLYGON');
  assert.equal(profile.aspectRatio, 2.5);
  assert.equal(profile.areaM2, 10);
  assert.deepEqual(profile.windowPositions, ['wall:1@0.50/140cm']);
  assert.deepEqual(profile.doorPositions, ['wall:3@0.20/90cm']);
  assert.ok(profile.circulationConstraints.includes('preserve elongated room proportions'));
  assert.ok(profile.usableSolidWallCm < profile.longWallCm);
});

test('falls back safely when reviewed geometry is incomplete', () => {
  const profile = new RoomSpatialProfileService().build({});

  assert.equal(profile.source, 'LIMITED');
  assert.equal(profile.sizeClass, 'SMALL');
  assert.deepEqual(profile.windowPositions, []);
  assert.deepEqual(profile.doorPositions, []);
});
