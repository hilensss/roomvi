import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const {
  ROOM_SHELL_ALGORITHM_VERSION,
  analyzeRoomShellCamera,
  buildRoomShellModel,
  getRoomShellFingerprint,
} = await import(
  '../dist/modules/generation-processing/room-shell-geometry.js'
);

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../docs/fixtures/b2b-developer-kvartira-16-latest-parsed-floorplan.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

function fixtureRoom(roomType) {
  const room = fixture.rooms.find((candidate) => candidate.roomType === roomType);
  assert.ok(room, `fixture room ${roomType} must exist`);
  return {
    id: room.roomId,
    name: room.name,
    roomType: room.roomType,
    widthCm: room.dimensions.widthCm,
    depthCm: room.dimensions.depthCm,
    ceilingHeightCm: room.dimensions.ceilingHeightCm,
    polygon: room.polygon,
    openings: room.openings,
  };
}

function pointInsidePolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses =
      a.yCm > point.yCm !== b.yCm > point.yCm &&
      point.xCm <
        ((b.xCm - a.xCm) * (point.yCm - a.yCm)) / (b.yCm - a.yCm) +
          a.xCm;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.xCm - start.xCm;
  const dy = end.yCm - start.yCm;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1,
      ((point.xCm - start.xCm) * dx + (point.yCm - start.yCm) * dy) /
        lengthSquared,
    ));
  return Math.hypot(
    point.xCm - (start.xCm + dx * ratio),
    point.yCm - (start.yCm + dy * ratio),
  );
}

function minimumWallDistance(point, polygon) {
  return Math.min(...polygon.map((start, index) =>
    pointToSegmentDistance(point, start, polygon[(index + 1) % polygon.length]),
  ));
}

function openingWithinHorizontalFov(model, opening) {
  const start = model.polygonCm[opening.wallSegmentIndex];
  const end = model.polygonCm[(opening.wallSegmentIndex + 1) % model.polygonCm.length];
  const center = {
    xCm: start.xCm + (end.xCm - start.xCm) * opening.positionRatio,
    yCm: start.yCm + (end.yCm - start.yCm) * opening.positionRatio,
  };
  const viewAngle = Math.atan2(
    model.camera.target.yCm - model.camera.position.yCm,
    model.camera.target.xCm - model.camera.position.xCm,
  );
  const openingAngle = Math.atan2(
    center.yCm - model.camera.position.yCm,
    center.xCm - model.camera.position.xCm,
  );
  const delta = Math.atan2(
    Math.sin(openingAngle - viewAngle),
    Math.cos(openingAngle - viewAngle),
  );
  return Math.abs(delta) <= (model.camera.fovDegrees * Math.PI) / 360;
}

test('kitchen_opening_topology: Квартира 16 preserves dimensions and opening wall assignments', () => {
  const model = buildRoomShellModel(fixtureRoom('KITCHEN'), 270);

  assert.equal(model.widthCm, 240);
  assert.equal(model.depthCm, 260);
  assert.equal(model.walls.length, 4);
  assert.equal(model.doors.length, 1);
  assert.equal(model.windows.length, 1);
  assert.equal(model.doors[0].wallSegmentIndex, 0);
  assert.equal(model.windows[0].wallSegmentIndex, 2);
  assert.equal(model.openings.length, 2);
});

test('living_irregular_polygon: Квартира 16 keeps the irregular polygon and all persisted openings', () => {
  const model = buildRoomShellModel(fixtureRoom('LIVING_ROOM'), 270);

  assert.equal(model.widthCm, 440);
  assert.equal(model.depthCm, 700);
  assert.equal(model.polygonCm.length, 9);
  assert.equal(model.walls.length, 9);
  assert.deepEqual(
    model.doors.map(({ wallSegmentIndex }) => wallSegmentIndex).sort((a, b) => a - b),
    [1, 2, 5, 7],
  );
  assert.deepEqual(
    model.windows.map(({ wallSegmentIndex }) => wallSegmentIndex),
    [3],
  );
});

test('bathroom_zero_windows: Квартира 16 remains 120x240 with one door and no windows', () => {
  const model = buildRoomShellModel(fixtureRoom('BATHROOM'), 270);

  assert.equal(model.widthCm, 120);
  assert.equal(model.depthCm, 240);
  assert.equal(model.doors.length, 1);
  assert.equal(model.doors[0].wallSegmentIndex, 3);
  assert.equal(model.windows.length, 0);
});

test('Квартира 16 bedroom shell remains 240x500 with its door and window', () => {
  const model = buildRoomShellModel(fixtureRoom('BEDROOM'), 270);

  assert.equal(model.widthCm, 240);
  assert.equal(model.depthCm, 500);
  assert.equal(model.doors.length, 1);
  assert.equal(model.windows.length, 1);
  assert.equal(model.doors[0].wallSegmentIndex, 3);
  assert.equal(model.windows[0].wallSegmentIndex, 1);
});

test('hallway_zero_windows and hallway_same_wall_doors: Квартира 16 preserves compact topology', () => {
  const model = buildRoomShellModel(fixtureRoom('HALLWAY'), 270);
  const crowdedWallDoors = model.doors
    .filter(({ wallSegmentIndex }) => wallSegmentIndex === 2)
    .sort((left, right) => left.startCm - right.startCm);

  assert.equal(model.widthCm, 120);
  assert.equal(model.depthCm, 160);
  assert.equal(model.doors.length, 3);
  assert.equal(model.windows.length, 0);
  assert.equal(crowdedWallDoors.length, 2);
  assert.ok(crowdedWallDoors[0].endCm < crowdedWallDoors[1].startCm);
  assert.ok(crowdedWallDoors.every(({ widthCm }) => widthCm < 90));
  assert.ok(
    model.warnings.some(
      ({ reason, wallSegmentIndex, openingCount }) =>
        reason === 'OVERLAPPING_OPENINGS' &&
        wallSegmentIndex === 2 &&
        openingCount === 2,
    ),
  );
});

test('living_camera_coverage: Квартира 16 framing shows the irregular extent without severe clipping', () => {
  const model = buildRoomShellModel(fixtureRoom('LIVING_ROOM'), 270);
  const coverage = analyzeRoomShellCamera(model);

  assert.ok(model.camera.fovDegrees >= 60 && model.camera.fovDegrees <= 80);
  assert.ok(
    coverage.floorVertexInFrameRatio >= 0.75,
    `floor vertices in frame: ${coverage.floorVertexInFrameRatio}`,
  );
  assert.ok(
    coverage.visibleOpeningCount >= 2,
    `visible openings: ${coverage.visibleOpeningCount}/${model.openings.length}`,
  );
  assert.ok(
    coverage.clippedGeometryRatio <= 0.4,
    `clipped geometry: ${coverage.clippedGeometryRatio}`,
  );
  assert.ok(
    coverage.floorAreaRatio >= 0.08,
    `floor area ratio: ${coverage.floorAreaRatio}`,
  );
});

test('kitchen_camera_coverage: Квартира 16 keeps its only window visible when the opposite door cannot share the frame', () => {
  const model = buildRoomShellModel(fixtureRoom('KITCHEN'), 270);
  const coverage = analyzeRoomShellCamera(model);

  assert.equal(coverage.framedWindowCount, 1);
  assert.ok(coverage.floorAreaRatio >= 0.08);
});

test('camera selection is deterministic, inside the room and uses a realistic FOV', () => {
  const room = fixtureRoom('HALLWAY');
  const first = buildRoomShellModel(room, 270);
  const second = buildRoomShellModel(room, 270);

  assert.deepEqual(first.camera, second.camera);
  assert.equal(pointInsidePolygon(first.camera.position, first.polygonCm), true);
  assert.ok(first.camera.fovDegrees >= 60 && first.camera.fovDegrees <= 80);
  assert.equal(first.widthCm, 120);
  assert.equal(first.depthCm, 160);
});

test('Квартира 16 camera keeps safe wall clearance instead of using an extreme corner', () => {
  for (const roomType of ['KITCHEN', 'LIVING_ROOM', 'BATHROOM', 'BEDROOM', 'HALLWAY']) {
    const model = buildRoomShellModel(fixtureRoom(roomType), 270);
    const requiredClearanceCm = Math.min(
      60,
      Math.min(model.widthCm, model.depthCm) * 0.25,
    );

    assert.ok(
      minimumWallDistance(model.camera.position, model.polygonCm) >= requiredClearanceCm,
      `${roomType} camera is too close to a wall`,
    );
  }
});

test('Квартира 16 bathroom camera keeps its only door inside the frame', () => {
  const model = buildRoomShellModel(fixtureRoom('BATHROOM'), 270);

  assert.equal(model.doors.length, 1);
  assert.equal(openingWithinHorizontalFov(model, model.doors[0]), true);
});

test('shell fingerprint changes only with geometry or algorithm version inputs', () => {
  const room = fixtureRoom('KITCHEN');
  const model = buildRoomShellModel(room, 270);
  const sameModel = buildRoomShellModel(structuredClone(room), 270);
  const changedRoom = structuredClone(room);
  changedRoom.polygon[1].x += 0.001;
  const changedModel = buildRoomShellModel(changedRoom, 270);

  assert.equal(getRoomShellFingerprint(model), getRoomShellFingerprint(sameModel));
  assert.notEqual(
    getRoomShellFingerprint(model),
    getRoomShellFingerprint(changedModel),
  );
  assert.notEqual(
    getRoomShellFingerprint(model),
    getRoomShellFingerprint(model, `${ROOM_SHELL_ALGORITHM_VERSION}-next`),
  );
});
