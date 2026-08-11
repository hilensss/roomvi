import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from '../storage/storage.service.js';
import {
  ROOM_SHELL_SCHEMA_VERSION,
  RoomShellCamera,
  RoomShellModel,
  RoomShellPoint,
  RoomShellSource,
  RoomShellWall,
  analyzeRoomShellCamera,
  buildRoomShellModel,
  clipRoomShellPolygonToNearPlane,
  getRoomShellFingerprint,
  projectRoomShellPoint,
} from './room-shell-geometry.js';

const SHELL_WIDTH = 1024;
const SHELL_HEIGHT = 768;
const SHELL_CACHE_FOLDER = `b2b-room-shell/${ROOM_SHELL_SCHEMA_VERSION}`;

type Point3 = { xCm: number; yCm: number; zCm: number };
type ProjectedPoint = { x: number; y: number; depth: number };
type Surface = {
  points: Point3[];
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
};

export type PreparedRoomShell = {
  url: string;
  key: string;
  fingerprint: string;
  cache: 'HIT' | 'MISS';
  durationMs: number;
  warnings: RoomShellModel['warnings'];
  model: {
    dimensions: string;
    polygonPoints: number;
    doorCount: number;
    windowCount: number;
    normalizedOpenings: number;
    openingSpans: string;
    camera: string;
    coverage: string;
  };
};

type CachedRoomShell = Omit<PreparedRoomShell, 'cache' | 'durationMs'> & {
  wasCached: boolean;
};

@Injectable()
export class RoomShellRendererService {
  private readonly logger = new Logger(RoomShellRendererService.name);
  private readonly inFlight = new Map<
    string,
    Promise<CachedRoomShell>
  >();

  constructor(private readonly storageService: StorageService) {}

  async prepareShell(input: {
    room: RoomShellSource;
    projectId: string;
    defaultCeilingHeightCm: number;
  }): Promise<PreparedRoomShell> {
    const startedAt = Date.now();
    const model = buildRoomShellModel(
      input.room,
      input.defaultCeilingHeightCm,
    );
    const fingerprint = getRoomShellFingerprint(model);
    const key = `${SHELL_CACHE_FOLDER}/${fingerprint}.png`;

    this.logNormalizationWarnings(model);

    const existing = this.inFlight.get(key);
    if (existing) {
      const joined = await existing;
      const result = {
        url: joined.url,
        key: joined.key,
        fingerprint: joined.fingerprint,
        warnings: joined.warnings,
        model: joined.model,
        cache: 'HIT' as const,
        durationMs: Date.now() - startedAt,
      };
      this.logPrepared(input.room, result);
      return result;
    }

    const preparation = this.prepareCachedObject({ key, fingerprint, model });
    this.inFlight.set(key, preparation);
    try {
      const prepared = await preparation;
      const cache = prepared.wasCached ? 'HIT' : 'MISS';
      const result = {
        url: prepared.url,
        key: prepared.key,
        fingerprint: prepared.fingerprint,
        warnings: prepared.warnings,
        model: prepared.model,
        cache,
        durationMs: Date.now() - startedAt,
      } satisfies PreparedRoomShell;
      this.logPrepared(input.room, result);
      return result;
    } finally {
      if (this.inFlight.get(key) === preparation) {
        this.inFlight.delete(key);
      }
    }
  }

  async renderPng(model: RoomShellModel) {
    return sharp(Buffer.from(this.buildSvg(model)))
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();
  }

  private async prepareCachedObject(input: {
    key: string;
    fingerprint: string;
    model: RoomShellModel;
  }) {
    const summary = this.modelSummary(input.model);
    if (await this.storageService.objectExists(input.key)) {
      return {
        url: this.storageService.getPublicUrl(input.key),
        key: input.key,
        fingerprint: input.fingerprint,
        warnings: input.model.warnings,
        model: summary,
        wasCached: true,
      };
    }

    const buffer = await this.renderPng(input.model);
    const uploaded = await this.storageService.uploadBuffer({
      buffer,
      contentType: 'image/png',
      extension: 'png',
      folder: SHELL_CACHE_FOLDER,
      key: input.key,
    });
    return {
      url: uploaded.url,
      key: uploaded.key,
      fingerprint: input.fingerprint,
      warnings: input.model.warnings,
      model: summary,
      wasCached: false,
    };
  }

  private buildSvg(model: RoomShellModel) {
    const floor = model.polygonCm.map((point) => ({ ...point, zCm: 0 }));
    const floorPoints = this.projectPolygon(floor, model.camera);
    const wallSurfaces = model.walls.flatMap((wall) =>
      this.buildWallSurfaces(wall, model.ceilingHeightCm),
    );
    const projectedWalls = wallSurfaces
      .map((surface) => ({
        surface,
        projected: this.projectPolygon(surface.points, model.camera),
        distance: this.averageDistance(surface.points, model.camera.position),
      }))
      .filter(
        (candidate): candidate is typeof candidate & { projected: string } =>
          Boolean(candidate.projected),
      )
      .sort((left, right) => right.distance - left.distance)
      .map(({ surface, projected }) =>
        this.svgPolygon(projected, surface),
      )
      .join('');
    const openingSurfaces = model.walls
      .flatMap((wall) => this.buildOpeningSurfaces(wall))
      .map((surface) => ({
        surface,
        projected: this.projectPolygon(surface.points, model.camera),
        distance: this.averageDistance(surface.points, model.camera.position),
      }))
      .filter(
        (candidate): candidate is typeof candidate & { projected: string } =>
          Boolean(candidate.projected),
      )
      .sort((left, right) => right.distance - left.distance)
      .map(({ surface, projected }) =>
        this.svgPolygon(projected, surface),
      )
      .join('');
    const ceilingEdges = model.walls
      .map((wall) => {
        const line = this.projectLine(
          { ...wall.start, zCm: model.ceilingHeightCm },
          { ...wall.end, zCm: model.ceilingHeightCm },
          model.camera,
        );
        return line
          ? `<line x1="${line.start.x}" y1="${line.start.y}" x2="${line.end.x}" y2="${line.end.y}" stroke="#cbd5e1" stroke-width="2"/>`
          : '';
      })
      .join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHELL_WIDTH}" height="${SHELL_HEIGHT}" viewBox="0 0 ${SHELL_WIDTH} ${SHELL_HEIGHT}">
      <rect width="${SHELL_WIDTH}" height="${SHELL_HEIGHT}" fill="#eef2f6"/>
      <defs>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e5e7eb"/>
          <stop offset="1" stop-color="#cbd5e1"/>
        </linearGradient>
      </defs>
      ${floorPoints ? `<polygon points="${floorPoints}" fill="url(#floor)" stroke="#94a3b8" stroke-width="2"/>` : ''}
      ${projectedWalls}
      ${openingSurfaces}
      ${ceilingEdges}
    </svg>`;
  }

  private buildWallSurfaces(wall: RoomShellWall, wallHeightCm: number) {
    const surfaces: Surface[] = [];
    const fill =
      wall.wallSegmentIndex % 2 === 0 ? '#f8fafc' : '#f1f5f9';
    let cursorCm = 0;

    for (const opening of wall.openings) {
      this.pushWallPanel(
        surfaces,
        wall,
        cursorCm,
        opening.startCm,
        0,
        wallHeightCm,
        fill,
      );
      if (opening.sillCm > 0) {
        this.pushWallPanel(
          surfaces,
          wall,
          opening.startCm,
          opening.endCm,
          0,
          opening.sillCm,
          fill,
        );
      }
      this.pushWallPanel(
        surfaces,
        wall,
        opening.startCm,
        opening.endCm,
        opening.headCm,
        wallHeightCm,
        fill,
      );
      cursorCm = opening.endCm;
    }
    this.pushWallPanel(
      surfaces,
      wall,
      cursorCm,
      wall.lengthCm,
      0,
      wallHeightCm,
      fill,
    );
    return surfaces;
  }

  private buildOpeningSurfaces(wall: RoomShellWall): Surface[] {
    return wall.openings.map((opening) => ({
      points: this.wallQuad(
        wall,
        opening.startCm,
        opening.endCm,
        opening.sillCm,
        opening.headCm,
      ),
      fill: opening.kind === 'WINDOW' ? '#bfdbfe' : '#475569',
      stroke: opening.kind === 'WINDOW' ? '#64748b' : '#334155',
      strokeWidth: opening.kind === 'WINDOW' ? 3 : 2,
      opacity: opening.kind === 'WINDOW' ? 0.62 : 0.82,
    }));
  }

  private pushWallPanel(
    surfaces: Surface[],
    wall: RoomShellWall,
    startCm: number,
    endCm: number,
    bottomCm: number,
    topCm: number,
    fill: string,
  ) {
    if (endCm - startCm < 0.1 || topCm - bottomCm < 0.1) return;
    surfaces.push({
      points: this.wallQuad(
        wall,
        startCm,
        endCm,
        bottomCm,
        topCm,
      ),
      fill,
      stroke: '#cbd5e1',
      strokeWidth: 1.5,
    });
  }

  private wallQuad(
    wall: RoomShellWall,
    startCm: number,
    endCm: number,
    bottomCm: number,
    topCm: number,
  ): Point3[] {
    const startRatio = startCm / wall.lengthCm;
    const endRatio = endCm / wall.lengthCm;
    const start = interpolate(wall.start, wall.end, startRatio);
    const end = interpolate(wall.start, wall.end, endRatio);
    return [
      { ...start, zCm: bottomCm },
      { ...end, zCm: bottomCm },
      { ...end, zCm: topCm },
      { ...start, zCm: topCm },
    ];
  }

  private projectPolygon(points: Point3[], camera: RoomShellCamera) {
    const clipped = clipRoomShellPolygonToNearPlane(points, camera);
    if (clipped.length < 3) return null;
    const projected = clipped.map((point) => this.project(point, camera));
    if (projected.some((point) => point === null)) return null;
    return (projected as ProjectedPoint[])
      .map(({ x, y }) => `${round(x)},${round(y)}`)
      .join(' ');
  }

  private projectLine(start: Point3, end: Point3, camera: RoomShellCamera) {
    const projectedStart = this.project(start, camera);
    const projectedEnd = this.project(end, camera);
    return projectedStart && projectedEnd
      ? { start: projectedStart, end: projectedEnd }
      : null;
  }

  private project(point: Point3, camera: RoomShellCamera): ProjectedPoint | null {
    return projectRoomShellPoint(point, camera);
  }

  private svgPolygon(points: string, surface: Surface) {
    return `<polygon points="${points}" fill="${surface.fill}" fill-opacity="${surface.opacity ?? 1}" stroke="${surface.stroke}" stroke-width="${surface.strokeWidth}" stroke-linejoin="round"/>`;
  }

  private averageDistance(
    points: Point3[],
    camera: RoomShellCamera['position'],
  ) {
    return (
      points.reduce(
        (sum, point) =>
          sum +
          Math.hypot(
            point.xCm - camera.xCm,
            point.yCm - camera.yCm,
            point.zCm - camera.zCm,
          ),
        0,
      ) / points.length
    );
  }

  private modelSummary(model: RoomShellModel) {
    const coverage = analyzeRoomShellCamera(model);
    return {
      dimensions: `${model.widthCm}x${model.depthCm}x${model.ceilingHeightCm}cm`,
      polygonPoints: model.polygonCm.length,
      doorCount: model.doors.length,
      windowCount: model.windows.length,
      normalizedOpenings: model.openings.filter(
        (opening) => opening.wasClamped,
      ).length,
      openingSpans:
        model.openings
          .map(
            (opening) =>
              `${opening.kind}:wall${opening.wallSegmentIndex}:${Math.round(opening.startCm)}-${Math.round(opening.endCm)}cm`,
          )
          .join('|') || 'none',
      camera: `candidate=${model.camera.candidateIndex},position=${Math.round(model.camera.position.xCm)}/${Math.round(model.camera.position.yCm)}/${model.camera.position.zCm},target=${Math.round(model.camera.target.xCm)}/${Math.round(model.camera.target.yCm)}/${Math.round(model.camera.target.zCm)},fov=${model.camera.fovDegrees}`,
      coverage: `floorVertices=${coverage.floorVertexInFrameRatio},floorArea=${coverage.floorAreaRatio},visibleDoors=${coverage.visibleDoorCount}/${model.doors.length},framedDoors=${coverage.framedDoorCount},visibleWindows=${coverage.visibleWindowCount}/${model.windows.length},framedWindows=${coverage.framedWindowCount},clipped=${coverage.clippedGeometryRatio}`,
    };
  }

  private logNormalizationWarnings(model: RoomShellModel) {
    for (const warning of model.warnings) {
      this.logger.warn(
        `B2B room geometry normalized: roomId=${model.roomId}, reason=${warning.reason}, wallSegmentIndex=${warning.wallSegmentIndex}, openingCount=${warning.openingCount}`,
      );
    }
  }

  private logPrepared(room: RoomShellSource, shell: PreparedRoomShell) {
    this.logger.log(
      `B2B room shell prepared: roomId=${room.id}, roomType=${room.roomType ?? 'UNKNOWN'}, dimensions=${shell.model.dimensions}, polygonPoints=${shell.model.polygonPoints}, doors=${shell.model.doorCount}, windows=${shell.model.windowCount}, openingSpans=${shell.model.openingSpans}, normalizedOpenings=${shell.model.normalizedOpenings}, camera=${shell.model.camera}, coverage=${shell.model.coverage}, cache=${shell.cache}, cacheKey=${shell.key}, durationMs=${shell.durationMs}`,
    );
  }
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

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
