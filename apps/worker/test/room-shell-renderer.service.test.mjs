import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';

const { buildRoomShellModel } = await import(
  '../dist/modules/generation-processing/room-shell-geometry.js'
);
const { RoomShellRendererService } = await import(
  '../dist/modules/generation-processing/room-shell-renderer.service.js'
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
  assert.ok(room);
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

test('renderer creates a deterministic perspective PNG from the physical shell model', async () => {
  const renderer = new RoomShellRendererService(null);
  const model = buildRoomShellModel(fixtureRoom('LIVING_ROOM'), 270);

  const first = await renderer.renderPng(model);
  const second = await renderer.renderPng(model);
  const metadata = await sharp(first).metadata();

  assert.deepEqual(first, second);
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 768);
});

test('renderer encodes doors as distinct physical voids without text labels', () => {
  const renderer = new RoomShellRendererService(null);
  const model = buildRoomShellModel(fixtureRoom('BATHROOM'), 270);

  const svg = renderer.buildSvg(model);

  assert.match(svg, /fill="#475569" fill-opacity="0\.82"/);
  assert.doesNotMatch(svg, />\s*(DOOR|WINDOW)\s*</i);
});

test('shell cache uses one versioned object for concurrent identical rooms', async () => {
  let uploads = 0;
  const storage = {
    objectExists: async () => false,
    getPublicUrl: (key) => `https://cdn.example.com/${key}`,
    uploadBuffer: async ({ key }) => {
      uploads += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { key, url: `https://cdn.example.com/${key}` };
    },
  };
  const renderer = new RoomShellRendererService(storage);
  const input = {
    room: fixtureRoom('KITCHEN'),
    projectId: fixture.project.id,
    defaultCeilingHeightCm: 270,
  };

  const [first, second] = await Promise.all([
    renderer.prepareShell(input),
    renderer.prepareShell(input),
  ]);

  assert.equal(uploads, 1);
  assert.equal(first.key, second.key);
  assert.match(first.key, /^b2b-room-shell\/v1\/[a-f0-9]{64}\.png$/);
  assert.equal(first.cache, 'MISS');
  assert.equal(second.cache, 'HIT');
});

test('shell cache hit returns the deterministic public URL without uploading', async () => {
  let uploads = 0;
  const storage = {
    objectExists: async () => true,
    getPublicUrl: (key) => `https://cdn.example.com/${key}`,
    uploadBuffer: async () => {
      uploads += 1;
      throw new Error('must not upload on hit');
    },
  };
  const renderer = new RoomShellRendererService(storage);

  const result = await renderer.prepareShell({
    room: fixtureRoom('BEDROOM'),
    projectId: fixture.project.id,
    defaultCeilingHeightCm: 270,
  });

  assert.equal(uploads, 0);
  assert.equal(result.cache, 'HIT');
  assert.equal(result.url, `https://cdn.example.com/${result.key}`);
});

test('hallway normalization produces the requested compact warning log', async () => {
  const warnings = [];
  const renderer = new RoomShellRendererService({
    objectExists: async () => true,
    getPublicUrl: (key) => `https://cdn.example.com/${key}`,
  });
  renderer.logger = {
    log: () => undefined,
    warn: (message) => warnings.push(message),
  };

  await renderer.prepareShell({
    room: fixtureRoom('HALLWAY'),
    projectId: fixture.project.id,
    defaultCeilingHeightCm: 270,
  });

  assert.ok(
    warnings.some(
      (message) =>
        message.includes('B2B room geometry normalized:') &&
        message.includes('reason=OVERLAPPING_OPENINGS') &&
        message.includes('wallSegmentIndex=2') &&
        message.includes('openingCount=2'),
    ),
  );
});
