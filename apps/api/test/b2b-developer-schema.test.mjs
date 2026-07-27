import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(
  new URL('../../../packages/database/prisma/schema.prisma', import.meta.url),
  'utf8',
);

test('developer floor-plan schema keeps the B2B analysis and room domain explicit', () => {
  for (const fragment of [
    'DEVELOPER_FLOOR_PLAN',
    'B2B_DEVELOPER_ROOM',
    'ANALYZING',
    'REVIEW_REQUIRED',
    'PARTIALLY_COMPLETED',
    'model B2BRoom {',
    'model B2BRoomOpening {',
    'model FloorPlanAnalysisRun {',
    'roomsRevision',
    'defaultCeilingHeightCm',
  ]) {
    assert.match(schema, new RegExp(fragment));
  }

  assert.match(schema, /supplierId\s+String\?/);
  assert.match(schema, /roomType\s+RoomType\?/);
});
