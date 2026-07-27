import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalPolygonSignature,
  isSimplePolygon,
} from '@roomvi/shared';

test('polygon validation rejects zero-area and self-intersecting rooms', () => {
  assert.equal(
    isSimplePolygon([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.9 },
    ]),
    false,
  );
  assert.equal(
    isSimplePolygon([
      { x: 0.1, y: 0.1 },
      { x: 0.8, y: 0.8 },
      { x: 0.8, y: 0.1 },
      { x: 0.1, y: 0.8 },
    ]),
    false,
  );
});

test('polygon signatures are stable across start point and winding', () => {
  const polygon = [
    { x: 0.1, y: 0.1 },
    { x: 0.8, y: 0.1 },
    { x: 0.8, y: 0.8 },
    { x: 0.1, y: 0.8 },
  ];
  const rotated = [...polygon.slice(2), ...polygon.slice(0, 2)];
  const reversed = [...polygon].reverse();

  assert.equal(
    canonicalPolygonSignature(polygon),
    canonicalPolygonSignature(rotated),
  );
  assert.equal(
    canonicalPolygonSignature(polygon),
    canonicalPolygonSignature(reversed),
  );
});
