import { createHash } from 'node:crypto';

export const ROOM_SHELL_SCHEMA_VERSION = 'v1';
export const ROOM_SHELL_ALGORITHM_VERSION = 'perspective-camera-v4';

const DOOR_DEFAULT_WIDTH_CM = 85;
const WINDOW_DEFAULT_WIDTH_CM = 120;
const DOOR_HEAD_CM = 210;
const WINDOW_SILL_CM = 90;
const WINDOW_HEAD_CM = 210;
const WALL_EDGE_MARGIN_CM = 4;
const OPENING_GAP_CM = 4;
const SHELL_FRAME_WIDTH = 1024;
const SHELL_FRAME_HEIGHT = 768;
const SHELL_FRAME_MARGIN_PX = 24;
const SHELL_NEAR_PLANE_CM = 5;

export type RoomShellPoint = {
  xCm: number;
  yCm: number;
};

export type RoomShellSourceOpening = {
  id?: string;
  kind: string;
  wallSegmentIndex: number;
  positionRatio: number;
  widthCm: number | null;
};

export type RoomShellSource = {
  id: string;
  name: string;
  roomType: string | null;
  widthCm: number | null;
  depthCm: number | null;
  ceilingHeightCm?: number | null;
  polygon: unknown;
  openings: RoomShellSourceOpening[];
};

export type NormalizedRoomShellOpening = {
  id?: string;
  kind: 'DOOR' | 'WINDOW';
  wallSegmentIndex: number;
  sourcePositionRatio: number;
  positionRatio: number;
  requestedWidthCm: number;
  widthCm: number;
  startCm: number;
  endCm: number;
  sillCm: number;
  headCm: number;
  wasClamped: boolean;
};

export type RoomShellWall = {
  wallSegmentIndex: number;
  start: RoomShellPoint;
  end: RoomShellPoint;
  lengthCm: number;
  openings: NormalizedRoomShellOpening[];
};

export type RoomShellWarning = {
  reason: 'OVERLAPPING_OPENINGS' | 'OPENING_WIDTH_CLAMPED';
  wallSegmentIndex: number;
  openingCount: number;
};

export type RoomShellCamera = {
  position: RoomShellPoint & { zCm: number };
  target: RoomShellPoint & { zCm: number };
  fovDegrees: number;
  candidateIndex: number;
};

export type RoomShellCameraCoverage = {
  floorVertexInFrameRatio: number;
  floorAreaRatio: number;
  visibleOpeningCount: number;
  visibleDoorCount: number;
  visibleWindowCount: number;
  framedDoorCount: number;
  framedWindowCount: number;
  clippedGeometryRatio: number;
};

export type RoomShellModel = {
  roomId: string;
  roomType: string | null;
  widthCm: number;
  depthCm: number;
  ceilingHeightCm: number;
  polygonCm: RoomShellPoint[];
  walls: RoomShellWall[];
  openings: NormalizedRoomShellOpening[];
  doors: NormalizedRoomShellOpening[];
  windows: NormalizedRoomShellOpening[];
  camera: RoomShellCamera;
  warnings: RoomShellWarning[];
};

type SourcePoint = { x: number; y: number };

export function buildRoomShellModel(
  room: RoomShellSource,
  defaultCeilingHeightCm: number,
): RoomShellModel {
  if (!room.widthCm || !room.depthCm) {
    throw new Error(`Room ${room.id} requires physical width and depth`);
  }
  const sourcePolygon = parsePolygon(room.polygon);
  if (sourcePolygon.length < 3) {
    throw new Error(`Room ${room.id} has invalid polygon geometry`);
  }

  const widthCm = room.widthCm;
  const depthCm = room.depthCm;
  const ceilingHeightCm = room.ceilingHeightCm ?? defaultCeilingHeightCm;
  const polygonCm = scalePolygon(sourcePolygon, widthCm, depthCm);
  const wallDrafts = polygonCm.map((start, wallSegmentIndex) => {
    const end = polygonCm[(wallSegmentIndex + 1) % polygonCm.length];
    return {
      wallSegmentIndex,
      start,
      end,
      lengthCm: distance(start, end),
    };
  });
  const { openings, warnings } = normalizeOpenings({
    sourceOpenings: room.openings,
    walls: wallDrafts,
    ceilingHeightCm,
  });
  const walls = wallDrafts.map((wall) => ({
    ...wall,
    openings: openings.filter(
      (opening) => opening.wallSegmentIndex === wall.wallSegmentIndex,
    ),
  }));
  const camera = chooseCamera({
    polygonCm,
    openings,
    widthCm,
    depthCm,
    ceilingHeightCm,
  });

  return {
    roomId: room.id,
    roomType: room.roomType,
    widthCm,
    depthCm,
    ceilingHeightCm,
    polygonCm,
    walls,
    openings,
    doors: openings.filter((opening) => opening.kind === 'DOOR'),
    windows: openings.filter((opening) => opening.kind === 'WINDOW'),
    camera,
    warnings,
  };
}

export function getRoomShellFingerprint(
  model: RoomShellModel,
  algorithmVersion = ROOM_SHELL_ALGORITHM_VERSION,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: ROOM_SHELL_SCHEMA_VERSION,
        algorithmVersion,
        widthCm: model.widthCm,
        depthCm: model.depthCm,
        ceilingHeightCm: model.ceilingHeightCm,
        polygonCm: model.polygonCm,
        openings: model.openings.map((opening) => ({
          kind: opening.kind,
          wallSegmentIndex: opening.wallSegmentIndex,
          sourcePositionRatio: opening.sourcePositionRatio,
          positionRatio: opening.positionRatio,
          widthCm: opening.widthCm,
          startCm: opening.startCm,
          endCm: opening.endCm,
          sillCm: opening.sillCm,
          headCm: opening.headCm,
        })),
        camera: model.camera,
      }),
    )
    .digest('hex');
}

export function analyzeRoomShellCamera(
  model: Pick<
    RoomShellModel,
    'polygonCm' | 'openings' | 'ceilingHeightCm' | 'camera'
  >,
): RoomShellCameraCoverage {
  return analyzeCameraCoverage({
    polygonCm: model.polygonCm,
    openings: model.openings,
    ceilingHeightCm: model.ceilingHeightCm,
    camera: model.camera,
  });
}

export function projectRoomShellPoint(
  point: { xCm: number; yCm: number; zCm: number },
  camera: RoomShellCamera,
) {
  if (
    Math.hypot(
      camera.target.xCm - camera.position.xCm,
      camera.target.yCm - camera.position.yCm,
    ) < 1
  ) {
    return null;
  }
  const { forward, right, up } = getCameraAxes(camera);
  const relative = {
    x: point.xCm - camera.position.xCm,
    y: point.yCm - camera.position.yCm,
    z: point.zCm - camera.position.zCm,
  };
  const depth = dot3d(relative, forward);
  if (depth <= SHELL_NEAR_PLANE_CM) return null;
  const focal =
    (SHELL_FRAME_WIDTH / 2) /
    Math.tan((camera.fovDegrees * Math.PI) / 360);
  return {
    x: SHELL_FRAME_WIDTH / 2 + (dot3d(relative, right) / depth) * focal,
    y:
      SHELL_FRAME_HEIGHT * 0.52 -
      (dot3d(relative, up) / depth) * focal,
    depth,
  };
}

export function clipRoomShellPolygonToNearPlane<
  T extends { xCm: number; yCm: number; zCm: number },
>(points: T[], camera: RoomShellCamera): Array<{ xCm: number; yCm: number; zCm: number }> {
  const clipped: Array<{ xCm: number; yCm: number; zCm: number }> = [];
  for (const [index, current] of points.entries()) {
    const next = points[(index + 1) % points.length];
    const currentDepth = getRoomShellPointDepth(current, camera);
    const nextDepth = getRoomShellPointDepth(next, camera);
    const currentInside = currentDepth > SHELL_NEAR_PLANE_CM;
    const nextInside = nextDepth > SHELL_NEAR_PLANE_CM;
    if (currentInside) clipped.push(current);
    if (currentInside === nextInside) continue;
    const ratio =
      (SHELL_NEAR_PLANE_CM + 0.01 - currentDepth) /
      (nextDepth - currentDepth);
    clipped.push({
      xCm: current.xCm + (next.xCm - current.xCm) * ratio,
      yCm: current.yCm + (next.yCm - current.yCm) * ratio,
      zCm: current.zCm + (next.zCm - current.zCm) * ratio,
    });
  }
  return clipped;
}

function getRoomShellPointDepth(
  point: { xCm: number; yCm: number; zCm: number },
  camera: RoomShellCamera,
) {
  const { forward } = getCameraAxes(camera);
  return dot3d(
    {
      x: point.xCm - camera.position.xCm,
      y: point.yCm - camera.position.yCm,
      z: point.zCm - camera.position.zCm,
    },
    forward,
  );
}

function getCameraAxes(camera: RoomShellCamera) {
  const forward = normalize3d({
    x: camera.target.xCm - camera.position.xCm,
    y: camera.target.yCm - camera.position.yCm,
    z: camera.target.zCm - camera.position.zCm,
  });
  const right = normalize3d(cross3d(forward, { x: 0, y: 0, z: 1 }));
  const up = normalize3d(cross3d(right, forward));
  return { forward, right, up };
}

function normalizeOpenings(input: {
  sourceOpenings: RoomShellSourceOpening[];
  walls: Array<{
    wallSegmentIndex: number;
    lengthCm: number;
  }>;
  ceilingHeightCm: number;
}) {
  const openings: NormalizedRoomShellOpening[] = [];
  const warnings: RoomShellWarning[] = [];

  for (const wall of input.walls) {
    const sourceOpenings = input.sourceOpenings
      .filter(
        (opening) =>
          opening.wallSegmentIndex === wall.wallSegmentIndex &&
          (opening.kind === 'DOOR' || opening.kind === 'WINDOW') &&
          Number.isFinite(opening.positionRatio),
      )
      .sort(
        (left, right) =>
          left.positionRatio - right.positionRatio ||
          left.kind.localeCompare(right.kind),
      );
    if (sourceOpenings.length === 0) continue;

    const centers = sourceOpenings.map((opening) =>
      clamp(opening.positionRatio, 0, 1) * wall.lengthCm,
    );
    const requestedWidths = sourceOpenings.map((opening) =>
      requestedOpeningWidth(opening, wall.lengthCm),
    );
    const hasRawOverlap = requestedWidths.some((widthCm, index) => {
      if (index === 0) return false;
      const previousEnd = centers[index - 1] + requestedWidths[index - 1] / 2;
      const currentStart = centers[index] - widthCm / 2;
      return currentStart < previousEnd + OPENING_GAP_CM;
    });
    let wallWasClamped = false;

    for (const [index, sourceOpening] of sourceOpenings.entries()) {
      const leftBoundary =
        index === 0
          ? WALL_EDGE_MARGIN_CM
          : (centers[index - 1] + centers[index]) / 2 + OPENING_GAP_CM / 2;
      const rightBoundary =
        index === sourceOpenings.length - 1
          ? wall.lengthCm - WALL_EDGE_MARGIN_CM
          : (centers[index] + centers[index + 1]) / 2 - OPENING_GAP_CM / 2;
      const availableWidth = Math.max(1, rightBoundary - leftBoundary);
      const requestedWidthCm = requestedWidths[index];
      const widthCm = Math.min(requestedWidthCm, availableWidth);
      const minimumCenter = leftBoundary + widthCm / 2;
      const maximumCenter = rightBoundary - widthCm / 2;
      const centerCm = clamp(
        centers[index],
        minimumCenter,
        Math.max(minimumCenter, maximumCenter),
      );
      const startCm = centerCm - widthCm / 2;
      const endCm = centerCm + widthCm / 2;
      const wasClamped =
        Math.abs(widthCm - requestedWidthCm) > 0.01 ||
        Math.abs(centerCm - centers[index]) > 0.01;
      wallWasClamped ||= wasClamped;
      const kind = sourceOpening.kind as 'DOOR' | 'WINDOW';
      const verticalSpan = getOpeningVerticalSpan(kind, input.ceilingHeightCm);

      openings.push({
        ...(sourceOpening.id ? { id: sourceOpening.id } : {}),
        kind,
        wallSegmentIndex: wall.wallSegmentIndex,
        sourcePositionRatio: sourceOpening.positionRatio,
        positionRatio: centerCm / wall.lengthCm,
        requestedWidthCm,
        widthCm,
        startCm,
        endCm,
        ...verticalSpan,
        wasClamped,
      });
    }

    if (hasRawOverlap || (sourceOpenings.length > 1 && wallWasClamped)) {
      warnings.push({
        reason: 'OVERLAPPING_OPENINGS',
        wallSegmentIndex: wall.wallSegmentIndex,
        openingCount: sourceOpenings.length,
      });
    } else if (wallWasClamped) {
      warnings.push({
        reason: 'OPENING_WIDTH_CLAMPED',
        wallSegmentIndex: wall.wallSegmentIndex,
        openingCount: sourceOpenings.length,
      });
    }
  }

  openings.sort(
    (left, right) =>
      left.wallSegmentIndex - right.wallSegmentIndex ||
      left.positionRatio - right.positionRatio,
  );
  return { openings, warnings };
}

function requestedOpeningWidth(
  opening: RoomShellSourceOpening,
  wallLengthCm: number,
) {
  if (opening.widthCm && opening.widthCm > 0) return opening.widthCm;
  if (opening.kind === 'WINDOW') {
    return Math.min(WINDOW_DEFAULT_WIDTH_CM, wallLengthCm * 0.6);
  }
  return Math.min(DOOR_DEFAULT_WIDTH_CM, wallLengthCm * 0.7);
}

function getOpeningVerticalSpan(
  kind: 'DOOR' | 'WINDOW',
  ceilingHeightCm: number,
) {
  if (kind === 'DOOR') {
    return {
      sillCm: 0,
      headCm: Math.min(DOOR_HEAD_CM, ceilingHeightCm - 20),
    };
  }
  const sillCm = Math.min(WINDOW_SILL_CM, ceilingHeightCm * 0.4);
  return {
    sillCm,
    headCm: Math.max(
      sillCm + 60,
      Math.min(WINDOW_HEAD_CM, ceilingHeightCm - 30),
    ),
  };
}

function chooseCamera(input: {
  polygonCm: RoomShellPoint[];
  openings: NormalizedRoomShellOpening[];
  widthCm: number;
  depthCm: number;
  ceilingHeightCm: number;
}): RoomShellCamera {
  const center = safePolygonCenter(input.polygonCm);
  const candidates = buildCameraCandidates(input.polygonCm);
  const areaM2 = (input.widthCm * input.depthCm) / 10_000;
  const aspectRatio =
    Math.max(input.widthCm, input.depthCm) /
    Math.min(input.widthCm, input.depthCm);
  const fovDegrees =
    areaM2 <= 4
      ? 80
      : input.polygonCm.length > 4
        ? 78
        : aspectRatio >= 1.8
          ? 76
          : 72;
  const openingCenters = input.openings.map((opening) => {
    const wallStart = input.polygonCm[opening.wallSegmentIndex];
    const wallEnd =
      input.polygonCm[(opening.wallSegmentIndex + 1) % input.polygonCm.length];
    return interpolate(wallStart, wallEnd, opening.positionRatio);
  });
  const openingFocus = openingCenters.length
    ? {
        xCm:
          openingCenters.reduce((sum, point) => sum + point.xCm, 0) /
          openingCenters.length,
        yCm:
          openingCenters.reduce((sum, point) => sum + point.yCm, 0) /
          openingCenters.length,
      }
    : center;
  const targetPoints = [
    center,
    {
      xCm: center.xCm * 0.65 + openingFocus.xCm * 0.35,
      yCm: center.yCm * 0.65 + openingFocus.yCm * 0.35,
    },
    ...openingCenters.map((openingCenter) => ({
      xCm: center.xCm * 0.55 + openingCenter.xCm * 0.45,
      yCm: center.yCm * 0.55 + openingCenter.yCm * 0.45,
    })),
  ];
  const scored = candidates.flatMap((position, candidateIndex) => {
    const minWallDistance = Math.min(
      ...input.polygonCm.map((point, index) =>
        pointToSegmentDistance(
          position,
          point,
          input.polygonCm[(index + 1) % input.polygonCm.length],
        ),
      ),
    );
    const distanceFromCenter = distance(position, center);
    return targetPoints.map((targetPoint, targetIndex) => {
      const viewDistance = distance(position, targetPoint);
      const camera = {
        position: { ...position, zCm: 158 },
        target: { ...targetPoint, zCm: Math.min(120, input.ceilingHeightCm * 0.44) },
        fovDegrees,
        candidateIndex,
      };
      const coverage = analyzeCameraCoverage({
        polygonCm: input.polygonCm,
        openings: input.openings,
        ceilingHeightCm: input.ceilingHeightCm,
        camera,
      });
      const floorAreaScore = Math.min(1, coverage.floorAreaRatio / 0.18);
      return {
        camera,
        targetIndex,
        minWallDistance,
        score:
          (viewDistance < 40 ? -1_000_000 : 0) +
          (coverage.floorAreaRatio === 0 ? -6000 : 0) +
          coverage.framedDoorCount * 1600 +
          coverage.framedWindowCount * 2600 +
          coverage.floorVertexInFrameRatio * 7000 +
          (1 - coverage.clippedGeometryRatio) * 3000 +
          floorAreaScore * 2500 +
          distanceFromCenter * 0.25 +
          minWallDistance * 0.5,
      };
    });
  });
  const requiredClearanceCm = Math.min(
    60,
    Math.min(input.widthCm, input.depthCm) * 0.25,
  );
  const safelyInside = scored.filter(
    ({ minWallDistance }) => minWallDistance >= requiredClearanceCm,
  );
  const selectable = safelyInside.length > 0 ? safelyInside : scored;
  const selected = selectable.sort(
    (left, right) =>
      right.score - left.score ||
      left.camera.candidateIndex - right.camera.candidateIndex ||
      left.targetIndex - right.targetIndex,
  )[0];
  return (
    selected?.camera ?? {
      position: { ...center, zCm: 158 },
      target: { ...center, zCm: Math.min(120, input.ceilingHeightCm * 0.44) },
      fovDegrees,
      candidateIndex: 0,
    }
  );
}

function analyzeCameraCoverage(input: {
  polygonCm: RoomShellPoint[];
  openings: NormalizedRoomShellOpening[];
  ceilingHeightCm: number;
  camera: RoomShellCamera;
}): RoomShellCameraCoverage {
  const floorProjected = input.polygonCm.map((point) =>
    projectRoomShellPoint({ ...point, zCm: 0 }, input.camera),
  );
  const floorInFrame = floorProjected.filter(
    (point) => point && pointInFrame(point),
  ).length;
  const clippedFloor = clipRoomShellPolygonToNearPlane(
    input.polygonCm.map((point) => ({ ...point, zCm: 0 })),
    input.camera,
  );
  const projectedFloor = clippedFloor
    .map((point) => projectRoomShellPoint(point, input.camera))
    .filter((point): point is NonNullable<typeof point> => Boolean(point));
  const floorAreaRatio =
    projectedFloor.length >= 3
      ? Math.min(
          1,
          polygonArea(
            projectedFloor.map((point) => ({
              x: clamp(point.x, 0, SHELL_FRAME_WIDTH),
              y: clamp(point.y, 0, SHELL_FRAME_HEIGHT),
            })),
          ) /
            (SHELL_FRAME_WIDTH * SHELL_FRAME_HEIGHT),
        )
      : 0;

  const openingPointGroups = input.openings.map((opening) => {
    const wallStart = input.polygonCm[opening.wallSegmentIndex];
    const wallEnd =
      input.polygonCm[(opening.wallSegmentIndex + 1) % input.polygonCm.length];
    const wallLength = distance(wallStart, wallEnd) || 1;
    const start = interpolate(wallStart, wallEnd, opening.startCm / wallLength);
    const end = interpolate(wallStart, wallEnd, opening.endCm / wallLength);
    return {
      opening,
      points: [
        { ...start, zCm: opening.sillCm },
        { ...end, zCm: opening.sillCm },
        { ...end, zCm: opening.headCm },
        { ...start, zCm: opening.headCm },
      ].map((point) => projectRoomShellPoint(point, input.camera)),
    };
  });
  const openingVisibility = openingPointGroups.map(({ opening, points }) => {
    const visiblePoints = points.filter(
      (point): point is NonNullable<typeof point> => Boolean(point),
    );
    if (visiblePoints.length < 3) {
      return { opening, visible: false, framed: false };
    }
    const inFramePoints = visiblePoints.filter(pointInFrame).length;
    const center = {
      x:
        visiblePoints.reduce((sum, point) => sum + point.x, 0) /
        visiblePoints.length,
      y:
        visiblePoints.reduce((sum, point) => sum + point.y, 0) /
        visiblePoints.length,
    };
    const visible = pointInFrame(center);
    return { opening, visible, framed: visible && inFramePoints >= 2 };
  });
  const visibleOpenings = openingVisibility.filter(({ visible }) => visible);
  const framedOpenings = openingVisibility.filter(({ framed }) => framed);
  const visibleDoorCount = visibleOpenings.filter(
    ({ opening }) => opening.kind === 'DOOR',
  ).length;
  const visibleWindowCount = visibleOpenings.filter(
    ({ opening }) => opening.kind === 'WINDOW',
  ).length;
  const framedDoorCount = framedOpenings.filter(
    ({ opening }) => opening.kind === 'DOOR',
  ).length;
  const framedWindowCount = framedOpenings.filter(
    ({ opening }) => opening.kind === 'WINDOW',
  ).length;

  const geometryPoints = [
    ...floorProjected,
    ...input.polygonCm.map((point) =>
      projectRoomShellPoint(
        { ...point, zCm: input.ceilingHeightCm },
        input.camera,
      ),
    ),
    ...openingPointGroups.flatMap(({ points }) => points),
  ];
  const clippedGeometry = geometryPoints.filter(
    (point) => !point || !pointInFrame(point),
  ).length;

  return {
    floorVertexInFrameRatio: roundRatio(
      floorInFrame / Math.max(1, input.polygonCm.length),
    ),
    floorAreaRatio: roundRatio(floorAreaRatio),
    visibleOpeningCount: visibleOpenings.length,
    visibleDoorCount,
    visibleWindowCount,
    framedDoorCount,
    framedWindowCount,
    clippedGeometryRatio: roundRatio(
      clippedGeometry / Math.max(1, geometryPoints.length),
    ),
  };
}

function pointInFrame(point: { x: number; y: number }) {
  return (
    point.x >= SHELL_FRAME_MARGIN_PX &&
    point.x <= SHELL_FRAME_WIDTH - SHELL_FRAME_MARGIN_PX &&
    point.y >= SHELL_FRAME_MARGIN_PX &&
    point.y <= SHELL_FRAME_HEIGHT - SHELL_FRAME_MARGIN_PX
  );
}

function polygonArea(points: Array<{ x: number; y: number }>) {
  return (
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    ) / 2
  );
}

function roundRatio(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function buildCameraCandidates(polygon: RoomShellPoint[]) {
  const xs = polygon.map(({ xCm }) => xCm);
  const ys = polygon.map(({ yCm }) => yCm);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const candidates: RoomShellPoint[] = [];
  const gridSize = 9;

  for (let yIndex = 0; yIndex < gridSize; yIndex += 1) {
    for (let xIndex = 0; xIndex < gridSize; xIndex += 1) {
      const xRatio = 0.12 + (0.76 * xIndex) / (gridSize - 1);
      const yRatio = 0.12 + (0.76 * yIndex) / (gridSize - 1);
      const point = {
        xCm: minX + (maxX - minX) * xRatio,
        yCm: minY + (maxY - minY) * yRatio,
      };
      if (pointInPolygon(point, polygon)) candidates.push(point);
    }
  }

  if (candidates.length > 0) return candidates;
  return [safePolygonCenter(polygon)];
}

function safePolygonCenter(polygon: RoomShellPoint[]) {
  const centroid = polygonCentroid(polygon);
  if (pointInPolygon(centroid, polygon)) return centroid;

  const average = {
    xCm: polygon.reduce((sum, point) => sum + point.xCm, 0) / polygon.length,
    yCm: polygon.reduce((sum, point) => sum + point.yCm, 0) / polygon.length,
  };
  if (pointInPolygon(average, polygon)) return average;

  return buildCameraCandidatesWithoutCenter(polygon)[0] ?? polygon[0];
}

function buildCameraCandidatesWithoutCenter(polygon: RoomShellPoint[]) {
  return polygon
    .map((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return interpolate(point, next, 0.5);
    })
    .filter((point) => pointInPolygon(point, polygon));
}

function polygonCentroid(polygon: RoomShellPoint[]) {
  let signedArea = 0;
  let x = 0;
  let y = 0;
  for (const [index, point] of polygon.entries()) {
    const next = polygon[(index + 1) % polygon.length];
    const cross = point.xCm * next.yCm - next.xCm * point.yCm;
    signedArea += cross;
    x += (point.xCm + next.xCm) * cross;
    y += (point.yCm + next.yCm) * cross;
  }
  if (Math.abs(signedArea) < 0.0001) {
    return {
      xCm: polygon.reduce((sum, point) => sum + point.xCm, 0) / polygon.length,
      yCm: polygon.reduce((sum, point) => sum + point.yCm, 0) / polygon.length,
    };
  }
  return {
    xCm: x / (3 * signedArea),
    yCm: y / (3 * signedArea),
  };
}

function pointInPolygon(point: RoomShellPoint, polygon: RoomShellPoint[]) {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.yCm > point.yCm !== previousPoint.yCm > point.yCm &&
      point.xCm <
        ((previousPoint.xCm - currentPoint.xCm) *
          (point.yCm - currentPoint.yCm)) /
          (previousPoint.yCm - currentPoint.yCm) +
          currentPoint.xCm;
    if (crosses) inside = !inside;
  }
  return inside;
}

function scalePolygon(
  polygon: SourcePoint[],
  widthCm: number,
  depthCm: number,
) {
  const minX = Math.min(...polygon.map(({ x }) => x));
  const maxX = Math.max(...polygon.map(({ x }) => x));
  const minY = Math.min(...polygon.map(({ y }) => y));
  const maxY = Math.max(...polygon.map(({ y }) => y));
  const sourceWidth = maxX - minX;
  const sourceDepth = maxY - minY;
  if (sourceWidth <= 0 || sourceDepth <= 0) {
    throw new Error('Room polygon must have non-zero width and depth');
  }
  return polygon.map((point) => ({
    xCm: round(((point.x - minX) / sourceWidth) * widthCm),
    yCm: round(((point.y - minY) / sourceDepth) * depthCm),
  }));
}

function parsePolygon(value: unknown): SourcePoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (point): point is SourcePoint =>
      Boolean(
        point &&
          typeof point === 'object' &&
          typeof (point as SourcePoint).x === 'number' &&
          Number.isFinite((point as SourcePoint).x) &&
          typeof (point as SourcePoint).y === 'number' &&
          Number.isFinite((point as SourcePoint).y),
      ),
  );
}

function pointToSegmentDistance(
  point: RoomShellPoint,
  start: RoomShellPoint,
  end: RoomShellPoint,
) {
  const dx = end.xCm - start.xCm;
  const dy = end.yCm - start.yCm;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const ratio = clamp(
    ((point.xCm - start.xCm) * dx + (point.yCm - start.yCm) * dy) /
      lengthSquared,
    0,
    1,
  );
  return distance(point, {
    xCm: start.xCm + dx * ratio,
    yCm: start.yCm + dy * ratio,
  });
}

function interpolate(
  start: RoomShellPoint,
  end: RoomShellPoint,
  ratio: number,
) {
  return {
    xCm: start.xCm + (end.xCm - start.xCm) * ratio,
    yCm: start.yCm + (end.yCm - start.yCm) * ratio,
  };
}

function normalize2d(vector: RoomShellPoint) {
  const length = Math.hypot(vector.xCm, vector.yCm) || 1;
  return { xCm: vector.xCm / length, yCm: vector.yCm / length };
}

function dot2d(left: RoomShellPoint, right: RoomShellPoint) {
  return left.xCm * right.xCm + left.yCm * right.yCm;
}

function normalize3d(vector: { x: number; y: number; z: number }) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross3d(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function dot3d(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function distance(left: RoomShellPoint, right: RoomShellPoint) {
  return Math.hypot(right.xCm - left.xCm, right.yCm - left.yCm);
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
