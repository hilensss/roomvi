import { Injectable } from '@nestjs/common';
import type { RoomSpatialProfile } from './product-curation.types.js';
import { buildRoomGeometryContract } from './room-geometry-contract.js';

type SpatialProfileInput = {
  widthCm?: number;
  depthCm?: number;
  areaM2?: number;
  ceilingHeightCm?: number;
  polygon?: unknown;
  openings?: Array<{
    kind: string;
    wallSegmentIndex: number;
    positionRatio: number;
    widthCm: number | null;
  }>;
  hasSourceImage?: boolean;
};

type Point = { x: number; y: number };

@Injectable()
export class RoomSpatialProfileService {
  build(input: SpatialProfileInput): RoomSpatialProfile {
    const polygon = this.parsePolygon(input.polygon);
    const areaM2 =
      input.areaM2 && input.areaM2 > 0
        ? input.areaM2
        : input.widthCm && input.depthCm
          ? (input.widthCm * input.depthCm) / 10_000
          : undefined;
    const wallLengths = this.getWallLengthsCm(
      polygon,
      input.widthCm,
      input.depthCm,
    );
    const openings = input.openings ?? [];
    const geometryContract = buildRoomGeometryContract({
      widthCm: input.widthCm,
      depthCm: input.depthCm,
      polygon,
      openings,
    });
    const usableWallLengths = wallLengths.map((length, wallIndex) => {
      const occupied = openings
        .filter(({ wallSegmentIndex }) => wallSegmentIndex === wallIndex)
        .reduce(
          (sum, opening) => sum + (opening.widthCm ?? this.defaultOpeningWidth(opening.kind)),
          0,
        );
      return Math.max(0, length - occupied);
    });
    const windowPositions = this.formatOpenings(openings, 'WINDOW');
    const doorPositions = this.formatOpenings(openings, 'DOOR');
    const wallSegments = wallLengths
      .map((length, wallSegmentIndex) => {
        const segmentOpenings = openings.filter(
          (opening) => opening.wallSegmentIndex === wallSegmentIndex,
        );
        return {
          wallSegmentIndex,
          lengthCm: Math.round(length),
          usableCm: Math.round(usableWallLengths[wallSegmentIndex] ?? length),
          hasWindow: segmentOpenings.some(({ kind }) => kind === 'WINDOW'),
          hasDoor: segmentOpenings.some(({ kind }) => kind === 'DOOR'),
        };
      })
      .sort((left, right) => right.usableCm - left.usableCm)
      .slice(0, 6);
    const mediaWallCandidate = wallSegments.find(
      (segment) =>
        !segment.hasWindow && !segment.hasDoor && segment.usableCm >= 180,
    );

    return {
      ...(input.widthCm ? { widthCm: input.widthCm } : {}),
      ...(input.depthCm ? { depthCm: input.depthCm } : {}),
      ...(areaM2 ? { areaM2: Number(areaM2.toFixed(2)) } : {}),
      ...(input.ceilingHeightCm
        ? { ceilingHeightCm: input.ceilingHeightCm }
        : {}),
      ...(input.widthCm && input.depthCm
        ? {
            aspectRatio: Number(
              (
                Math.max(input.widthCm, input.depthCm) /
                Math.min(input.widthCm, input.depthCm)
              ).toFixed(2),
            ),
          }
        : {}),
      ...(polygon.length >= 3 ? { polygonPoints: polygon.length } : {}),
      windowPositions,
      doorPositions,
      ...(wallLengths.length > 0
        ? { longWallCm: Math.round(Math.max(...wallLengths)) }
        : input.widthCm || input.depthCm
          ? { longWallCm: Math.max(input.widthCm ?? 0, input.depthCm ?? 0) }
          : {}),
      ...(usableWallLengths.length > 0
        ? { usableSolidWallCm: Math.round(Math.max(...usableWallLengths)) }
        : input.widthCm || input.depthCm
          ? {
              usableSolidWallCm: Math.max(
                input.widthCm ?? 0,
                input.depthCm ?? 0,
              ),
            }
          : {}),
      wallSegments,
      ...(mediaWallCandidate
        ? {
            mediaWallCandidate: {
              wallSegmentIndex: mediaWallCandidate.wallSegmentIndex,
              usableCm: mediaWallCandidate.usableCm,
            },
          }
        : {}),
      exactDoorCount: geometryContract.doorCount,
      exactWindowCount: geometryContract.windowCount,
      cameraWall: geometryContract.cameraWall,
      geometryContract: geometryContract.promptLines,
      geometryWarnings: geometryContract.warnings,
      circulationConstraints: this.buildCirculationConstraints({
        areaM2,
        aspectRatio:
          input.widthCm && input.depthCm
            ? Math.max(input.widthCm, input.depthCm) /
              Math.min(input.widthCm, input.depthCm)
            : undefined,
        windows: windowPositions.length,
        doors: doorPositions.length,
        hasSourceImage: input.hasSourceImage,
      }),
      sizeClass: this.getSizeClass(areaM2),
      source:
        polygon.length >= 3 && input.widthCm && input.depthCm
          ? 'REVIEWED_POLYGON'
          : input.widthCm && input.depthCm
            ? 'DIMENSIONS'
            : 'LIMITED',
    };
  }

  private parsePolygon(value: unknown): Point[] {
    if (!Array.isArray(value)) return [];

    return value.filter(
      (point): point is Point =>
        Boolean(
          point &&
            typeof point === 'object' &&
            typeof (point as Point).x === 'number' &&
            typeof (point as Point).y === 'number',
        ),
    );
  }

  private getWallLengthsCm(
    polygon: Point[],
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

  private formatOpenings(
    openings: SpatialProfileInput['openings'],
    kind: 'WINDOW' | 'DOOR',
  ) {
    return (openings ?? [])
      .filter((opening) => opening.kind === kind)
      .map(
        (opening) =>
          `wall:${opening.wallSegmentIndex}@${opening.positionRatio.toFixed(2)}${
            opening.widthCm ? `/${opening.widthCm}cm` : ''
          }`,
      );
  }

  private defaultOpeningWidth(kind: string) {
    return kind === 'WINDOW' ? 120 : 90;
  }

  private buildCirculationConstraints(input: {
    areaM2?: number;
    aspectRatio?: number;
    windows: number;
    doors: number;
    hasSourceImage?: boolean;
  }) {
    const constraints: string[] = [];
    if (input.doors > 0) constraints.push('keep door-to-room paths clear');
    if (input.windows > 0) constraints.push('do not block window access');
    if (input.aspectRatio && input.aspectRatio >= 1.6) {
      constraints.push('preserve elongated room proportions');
    }
    if (input.areaM2 && input.areaM2 < 9) {
      constraints.push('use compact wall-aligned furniture');
    }
    if (input.hasSourceImage) {
      constraints.push('preserve source camera and opening topology');
    }
    return constraints.slice(0, 4);
  }

  private getSizeClass(areaM2?: number): RoomSpatialProfile['sizeClass'] {
    if (!areaM2 || areaM2 < 10) return 'SMALL';
    if (areaM2 < 22) return 'MEDIUM';
    return 'LARGE';
  }
}
