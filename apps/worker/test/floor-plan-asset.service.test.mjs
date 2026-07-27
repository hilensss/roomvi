import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

const { FloorPlanAssetService } = await import(
  '../dist/modules/floor-plan-analysis/floor-plan-asset.service.js'
);

const onePixelPng = await sharp({
  create: {
    width: 1,
    height: 1,
    channels: 3,
    background: '#ffffff',
  },
})
  .png()
  .toBuffer();

test('floor-plan assets are read by storage key with a streaming byte cap', async () => {
  let downloadArgs;
  const service = new FloorPlanAssetService({
    downloadBuffer: async (...args) => {
      downloadArgs = args;
      return onePixelPng;
    },
  });

  const result = await service.loadNormalizedImage({
    storageKey: 'uploads/rooms/plan.png',
    mimeType: 'image/png',
    sizeBytes: onePixelPng.length,
  });

  assert.deepEqual(downloadArgs, [
    'uploads/rooms/plan.png',
    10 * 1024 * 1024,
  ]);
  assert.equal(result.mimeType, 'image/jpeg');
  assert.ok(result.bytes.length > 0);
});

test('floor-plan metadata is rejected before storage download when oversized', async () => {
  const service = new FloorPlanAssetService({
    downloadBuffer: async () => assert.fail('oversized file cannot download'),
  });

  await assert.rejects(
    service.loadNormalizedImage({
      storageKey: 'uploads/rooms/large.png',
      mimeType: 'image/png',
      sizeBytes: 10 * 1024 * 1024 + 1,
    }),
    /too large/i,
  );
});
