import { Injectable } from '@nestjs/common';
import { RoomType } from '@roomvi/database';
import {
  canonicalPolygonSignature,
  isSimplePolygon,
} from '@roomvi/shared';
import { ReasoningAiService } from '../reasoning-ai/reasoning-ai.service.js';
import type { ReasoningAttachment } from '../reasoning-ai/reasoning-ai.types.js';
import { floorPlanAnalysisJsonSchema } from './floor-plan-analysis.schema.js';

type Point = { x: number; y: number };

export type NormalizedOpening = {
  kind: 'WINDOW' | 'DOOR';
  wallSegmentIndex: number;
  positionRatio: number;
  widthCm: number | null;
  recognitionConfidence: number;
};

export type NormalizedRoomDraft = {
  sourceLabel: string | null;
  name: string;
  roomType: RoomType | null;
  polygon: Point[];
  widthCm: number | null;
  depthCm: number | null;
  areaM2: number | null;
  ceilingHeightCm: number | null;
  recognitionConfidence: number;
  recognitionNotes: string | null;
  openings: NormalizedOpening[];
};

export type FloorPlanAnalysisResult = {
  rooms: NormalizedRoomDraft[];
  warnings: string[];
  provider: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

const supportedRoomTypes = new Set<string>(Object.values(RoomType));

@Injectable()
export class FloorPlanAnalyzerService {
  constructor(private readonly reasoningAi: ReasoningAiService) {}

  async analyze(
    attachment: ReasoningAttachment,
  ): Promise<FloorPlanAnalysisResult> {
    const result = await this.reasoningAi.generateStructured({
      taskName: 'floor_plan_analysis',
      systemPrompt: [
        'You analyze architectural apartment floor plans.',
        'Extract every enclosed room polygon, dimensions, likely room type, windows, and doors.',
        'Coordinates are normalized page coordinates from 0 to 1, measured from the top-left.',
        'Opening wallSegmentIndex refers to polygon point i through point (i + 1) modulo point count.',
        'Do not invent labels or exact measurements that are not visible; use null and lower confidence.',
      ].join(' '),
      userPrompt: [
        'Return the strict JSON schema only.',
        'Use centimetres for width, depth, ceiling height and square metres for area.',
        'Use Russian suggested room names.',
        'Preserve windows and doors on the wall where they appear.',
      ].join(' '),
      jsonSchema: floorPlanAnalysisJsonSchema as unknown as Record<
        string,
        unknown
      >,
      attachments: [attachment],
    });

    const { rooms, warnings } = this.normalize(result.data);
    return {
      rooms,
      warnings,
      provider: result.provider,
      model: result.model,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  }

  private normalize(data: unknown): {
    rooms: NormalizedRoomDraft[];
    warnings: string[];
  } {
    if (!this.isRecord(data) || !Array.isArray(data.rooms)) {
      throw new Error('Floor-plan analysis has an invalid root shape');
    }

    const warnings: string[] = [];
    const rooms: NormalizedRoomDraft[] = [];
    const polygonSignatures = new Set<string>();

    for (let index = 0; index < data.rooms.slice(0, 40).length; index += 1) {
      const proposed = data.rooms[index];
      if (!this.isRecord(proposed)) {
        warnings.push(`Комната ${index + 1} отброшена: неверный формат.`);
        continue;
      }

      const polygon = this.normalizePolygon(proposed.polygon);
      if (!polygon) {
        warnings.push(
          `Комната ${index + 1} отброшена: нераспознаваемый контур.`,
        );
        continue;
      }
      const signature = this.polygonSignature(polygon);
      if (polygonSignatures.has(signature)) {
        warnings.push(
          `Комната ${index + 1} отброшена как дубликат контура.`,
        );
        continue;
      }
      polygonSignatures.add(signature);

      const confidence = this.confidence(proposed.confidence);
      const notes: string[] = [];
      const proposedType =
        typeof proposed.roomType === 'string' ? proposed.roomType : null;
      const roomType =
        proposedType &&
        supportedRoomTypes.has(proposedType) &&
        confidence >= 0.45
          ? (proposedType as RoomType)
          : null;
      if (proposedType && !roomType) {
        notes.push('Тип комнаты требует ручной проверки.');
      }

      const widthCm = this.plausibleInteger(proposed.widthCm, 80, 5000);
      const depthCm = this.plausibleInteger(proposed.depthCm, 80, 5000);
      let areaM2 = this.plausibleNumber(proposed.areaM2, 1, 1000, 1);
      const ceilingHeightCm = this.plausibleInteger(
        proposed.ceilingHeightCm,
        180,
        600,
      );
      if (
        (proposed.widthCm != null && widthCm == null) ||
        (proposed.depthCm != null && depthCm == null) ||
        (proposed.areaM2 != null && areaM2 == null) ||
        (proposed.ceilingHeightCm != null && ceilingHeightCm == null)
      ) {
        notes.push('Один или несколько размеров требуют ручной проверки.');
        warnings.push(
          `У комнаты ${index + 1} отброшен неправдоподобный размер.`,
        );
      }
      if (
        widthCm &&
        depthCm &&
        areaM2 &&
        this.hasGrossAreaMismatch(widthCm, depthCm, areaM2)
      ) {
        areaM2 = null;
        notes.push('Площадь не согласуется с распознанными размерами.');
        warnings.push(
          `У комнаты ${index + 1} площадь требует ручной проверки.`,
        );
      }

      const openings = this.normalizeOpenings(
        proposed.openings,
        polygon.length,
      );
      if (
        Array.isArray(proposed.openings) &&
        openings.length !== proposed.openings.length
      ) {
        notes.push('Часть проёмов требует ручной проверки.');
        warnings.push(
          `У комнаты ${index + 1} отброшен некорректный проём.`,
        );
      }

      const providerNotes =
        typeof proposed.notes === 'string' && proposed.notes.trim()
          ? proposed.notes.trim()
          : null;
      if (providerNotes) notes.unshift(providerNotes);

      rooms.push({
        sourceLabel:
          typeof proposed.sourceLabel === 'string' &&
          proposed.sourceLabel.trim()
            ? proposed.sourceLabel.trim()
            : null,
        name:
          typeof proposed.suggestedName === 'string' &&
          proposed.suggestedName.trim()
            ? proposed.suggestedName.trim().slice(0, 120)
            : `Комната ${index + 1}`,
        roomType,
        polygon,
        widthCm,
        depthCm,
        areaM2,
        ceilingHeightCm,
        recognitionConfidence: confidence,
        recognitionNotes: notes.length > 0 ? notes.join(' ') : null,
        openings,
      });
    }

    if (rooms.length === 0) {
      throw new Error('No reviewable rooms were recognized');
    }
    return { rooms, warnings };
  }

  private normalizePolygon(value: unknown): Point[] | null {
    if (!Array.isArray(value) || value.length < 3 || value.length > 80) {
      return null;
    }
    const points: Point[] = [];
    for (const point of value) {
      if (!this.isRecord(point)) return null;
      const x = this.normalizedCoordinate(point.x);
      const y = this.normalizedCoordinate(point.y);
      if (x === null || y === null) return null;
      points.push({ x, y });
    }
    const distinct = new Set(
      points.map(({ x, y }) => `${x.toFixed(5)}:${y.toFixed(5)}`),
    );
    return distinct.size >= 3 && isSimplePolygon(points) ? points : null;
  }

  private normalizeOpenings(
    value: unknown,
    segmentCount: number,
  ): NormalizedOpening[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((opening) => {
      if (!this.isRecord(opening)) return [];
      const kind =
        opening.kind === 'WINDOW' || opening.kind === 'DOOR'
          ? opening.kind
          : null;
      const wallSegmentIndex =
        Number.isInteger(opening.wallSegmentIndex) &&
        Number(opening.wallSegmentIndex) >= 0 &&
        Number(opening.wallSegmentIndex) < segmentCount
          ? Number(opening.wallSegmentIndex)
          : null;
      const positionRatio = this.normalizedCoordinate(
        opening.positionRatio,
      );
      const widthCm =
        opening.widthCm == null
          ? null
          : this.plausibleInteger(opening.widthCm, 30, 1000);
      if (
        !kind ||
        wallSegmentIndex === null ||
        positionRatio === null ||
        (opening.widthCm != null && widthCm === null)
      ) {
        return [];
      }
      return [
        {
          kind,
          wallSegmentIndex,
          positionRatio,
          widthCm,
          recognitionConfidence: this.confidence(opening.confidence),
        },
      ];
    });
  }

  private normalizedCoordinate(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value < -0.001 || value > 1.001) return null;
    return Math.min(1, Math.max(0, value));
  }

  private plausibleInteger(
    value: unknown,
    min: number,
    max: number,
  ): number | null {
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    return rounded >= min && rounded <= max ? rounded : null;
  }

  private plausibleNumber(
    value: unknown,
    min: number,
    max: number,
    precision: number,
  ): number | null {
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value < min || value > max) return null;
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  private confidence(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  private polygonSignature(polygon: Point[]) {
    return canonicalPolygonSignature(polygon);
  }

  private hasGrossAreaMismatch(
    widthCm: number,
    depthCm: number,
    areaM2: number,
  ) {
    const boundingAreaM2 = (widthCm * depthCm) / 10_000;
    const ratio = areaM2 / boundingAreaM2;
    return ratio < 0.35 || ratio > 1.25;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
