export type PolygonPoint = { x: number; y: number };

const EPSILON = 1e-8;

export function polygonArea(points: PolygonPoint[]) {
  if (points.length < 3) return 0;

  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(twiceArea) / 2;
}

export function isSimplePolygon(points: PolygonPoint[]) {
  if (points.length < 3 || polygonArea(points) <= EPSILON) return false;

  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (
        left === right ||
        leftNext === right ||
        rightNext === left
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          points[left]!,
          points[leftNext]!,
          points[right]!,
          points[rightNext]!,
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

export function canonicalPolygonSignature(
  points: PolygonPoint[],
  precision = 3,
) {
  const encoded = points.map(
    ({ x, y }) => `${x.toFixed(precision)}:${y.toFixed(precision)}`,
  );
  const candidates = [
    ...rotations(encoded),
    ...rotations([...encoded].reverse()),
  ];
  candidates.sort();
  return candidates[0] ?? '';
}

function rotations(values: string[]) {
  return values.map((_, index) =>
    [...values.slice(index), ...values.slice(0, index)].join('|'),
  );
}

function segmentsIntersect(
  firstStart: PolygonPoint,
  firstEnd: PolygonPoint,
  secondStart: PolygonPoint,
  secondEnd: PolygonPoint,
) {
  const firstA = orientation(firstStart, firstEnd, secondStart);
  const firstB = orientation(firstStart, firstEnd, secondEnd);
  const secondA = orientation(secondStart, secondEnd, firstStart);
  const secondB = orientation(secondStart, secondEnd, firstEnd);

  if (
    Math.sign(firstA) !== Math.sign(firstB) &&
    Math.sign(secondA) !== Math.sign(secondB)
  ) {
    return true;
  }

  return (
    (Math.abs(firstA) <= EPSILON &&
      onSegment(firstStart, secondStart, firstEnd)) ||
    (Math.abs(firstB) <= EPSILON &&
      onSegment(firstStart, secondEnd, firstEnd)) ||
    (Math.abs(secondA) <= EPSILON &&
      onSegment(secondStart, firstStart, secondEnd)) ||
    (Math.abs(secondB) <= EPSILON &&
      onSegment(secondStart, firstEnd, secondEnd))
  );
}

function orientation(
  start: PolygonPoint,
  end: PolygonPoint,
  point: PolygonPoint,
) {
  return (
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x)
  );
}

function onSegment(
  start: PolygonPoint,
  point: PolygonPoint,
  end: PolygonPoint,
) {
  return (
    point.x >= Math.min(start.x, end.x) - EPSILON &&
    point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.y >= Math.min(start.y, end.y) - EPSILON &&
    point.y <= Math.max(start.y, end.y) + EPSILON
  );
}
