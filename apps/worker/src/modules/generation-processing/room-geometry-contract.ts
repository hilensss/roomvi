export type GeometryPoint = { x: number; y: number };
export type GeometryOpening = {
  kind: string;
  wallSegmentIndex: number;
  positionRatio: number;
  widthCm: number | null;
};

export type GeometryWallContract = {
  wallSegmentIndex: number;
  lengthCm: number;
  openings: GeometryOpening[];
  hasDoor: boolean;
  hasWindow: boolean;
};

export type RoomGeometryContract = {
  wallSegments: GeometryWallContract[];
  doorCount: number;
  windowCount: number;
  cameraWall: number;
  promptLines: string[];
  warnings: string[];
};

export function buildRoomGeometryContract(input: {
  widthCm?: number | null;
  depthCm?: number | null;
  polygon: unknown;
  openings?: GeometryOpening[] | null;
}): RoomGeometryContract {
  const polygon = parsePolygon(input.polygon);
  const openings = (input.openings ?? []).filter(isValidOpening);
  const wallLengths = getWallLengthsCm(
    polygon,
    input.widthCm ?? undefined,
    input.depthCm ?? undefined,
  );
  const wallSegments: GeometryWallContract[] = wallLengths.map(
    (lengthCm, wallSegmentIndex) => {
      const wallOpenings = openings
        .filter((opening) => opening.wallSegmentIndex === wallSegmentIndex)
        .sort((left, right) => left.positionRatio - right.positionRatio);
      return {
        wallSegmentIndex,
        lengthCm: Math.round(lengthCm),
        openings: wallOpenings,
        hasDoor: wallOpenings.some((opening) => opening.kind === 'DOOR'),
        hasWindow: wallOpenings.some((opening) => opening.kind === 'WINDOW'),
      };
    },
  );

  const doorCount = openings.filter((opening) => opening.kind === 'DOOR').length;
  const windowCount = openings.filter((opening) => opening.kind === 'WINDOW').length;
  const warnings: string[] = [];

  for (const wall of wallSegments) {
    const explicitWidth = wall.openings.reduce(
      (sum, opening) => sum + (opening.widthCm ?? 0),
      0,
    );
    if (explicitWidth > wall.lengthCm * 1.05) {
      warnings.push(
        `Wall ${wall.wallSegmentIndex} opening widths exceed physical wall length (${explicitWidth}cm > ${wall.lengthCm}cm); preserve opening count and relative positions, not conflicting widths.`,
      );
    }
  }

  const cameraWall = chooseCameraWall(wallSegments);
  const promptLines = [
    openingCountSentence(doorCount, windowCount),
    ...wallSegments
      .filter((wall) => wall.openings.length > 0)
      .map(describeOpeningWall),
    'Keep the cyclic wall order exactly as reviewed. Never add, remove, mirror, swap or relocate an opening.',
  ];

  if (warnings.length > 0) {
    promptLines.push(
      'Some reviewed opening widths conflict with the compact room dimensions; in that case opening COUNT, wall assignment and relative positions are authoritative, while the conflicting numeric widths are not.',
    );
  }

  return {
    wallSegments,
    doorCount,
    windowCount,
    cameraWall,
    promptLines,
    warnings,
  };
}

export function getWallOpeningSpans(input: {
  wallLengthCm: number;
  openings: GeometryOpening[];
}) {
  const { wallLengthCm, openings } = input;
  if (wallLengthCm <= 0) return [];
  return openings.map((opening) => {
    const defaultWidth = opening.kind === 'WINDOW' ? 120 : 90;
    const requestedWidth = opening.widthCm ?? defaultWidth;
    const maxWidth = Math.max(20, wallLengthCm * 0.7);
    const widthCm = Math.min(requestedWidth, maxWidth);
    const halfRatio = widthCm / wallLengthCm / 2;
    const center = clamp(opening.positionRatio, 0.04, 0.96);
    const startRatio = clamp(center - halfRatio, 0.01, 0.98);
    const endRatio = clamp(center + halfRatio, startRatio + 0.01, 0.99);
    return { opening, startRatio, endRatio };
  });
}

function openingCountSentence(doors: number, windows: number) {
  const doorText = doors === 0 ? 'no doors' : `exactly ${doors} ${doors === 1 ? 'door' : 'doors'}`;
  const windowText = windows === 0 ? 'no windows' : `exactly ${windows} ${windows === 1 ? 'window' : 'windows'}`;
  return `OPENING COUNT IS HARD GEOMETRY: ${doorText} and ${windowText}.`;
}

function describeOpeningWall(wall: GeometryWallContract) {
  const doors = wall.openings.filter((opening) => opening.kind === 'DOOR');
  const windows = wall.openings.filter((opening) => opening.kind === 'WINDOW');
  const parts: string[] = [];
  if (doors.length > 0) {
    parts.push(
      doors.length === 1
        ? `one door at ${percent(doors[0].positionRatio)}`
        : `${numberWord(doors.length)} doors at ${doors.map((opening) => percent(opening.positionRatio)).join(' and ')}`,
    );
  }
  if (windows.length > 0) {
    parts.push(
      windows.length === 1
        ? `one window at ${percent(windows[0].positionRatio)}`
        : `${numberWord(windows.length)} windows at ${windows.map((opening) => percent(opening.positionRatio)).join(' and ')}`,
    );
  }
  return `Wall ${wall.wallSegmentIndex} has ${parts.join('; ')} measured from its start in polygon order.`;
}

function numberWord(value: number) {
  return value === 2 ? 'two' : value === 3 ? 'three' : String(value);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function chooseCameraWall(walls: GeometryWallContract[]) {
  const candidates = walls.filter((wall) => wall.openings.length === 0);
  const pool = candidates.length > 0 ? candidates : walls;
  return [...pool].sort((left, right) => right.lengthCm - left.lengthCm)[0]?.wallSegmentIndex ?? 0;
}

function parsePolygon(value: unknown): GeometryPoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (point): point is GeometryPoint =>
      Boolean(
        point &&
          typeof point === 'object' &&
          typeof (point as GeometryPoint).x === 'number' &&
          typeof (point as GeometryPoint).y === 'number',
      ),
  );
}

function isValidOpening(opening: GeometryOpening) {
  return (
    (opening.kind === 'DOOR' || opening.kind === 'WINDOW') &&
    Number.isInteger(opening.wallSegmentIndex) &&
    Number.isFinite(opening.positionRatio)
  );
}

function getWallLengthsCm(
  polygon: GeometryPoint[],
  widthCm?: number,
  depthCm?: number,
) {
  if (polygon.length < 3 || !widthCm || !depthCm) return [];
  const xs = polygon.map(({ x }) => x);
  const ys = polygon.map(({ y }) => y);
  const polygonWidth = Math.max(...xs) - Math.min(...xs) || 1;
  const polygonDepth = Math.max(...ys) - Math.min(...ys) || 1;

  return polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const dx = ((next.x - point.x) / polygonWidth) * widthCm;
    const dy = ((next.y - point.y) / polygonDepth) * depthCm;
    return Math.hypot(dx, dy);
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
