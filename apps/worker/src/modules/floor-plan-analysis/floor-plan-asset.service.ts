import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { ReasoningAttachment } from '../reasoning-ai/reasoning-ai.types.js';
import { StorageService } from '../storage/storage.service.js';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class FloorPlanAssetService {
  constructor(private readonly storage: StorageService) {}

  async loadNormalizedImage(file: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<ReasoningAttachment> {
    const contentType = file.mimeType.trim().toLowerCase();
    if (!contentType || !ACCEPTED_IMAGE_TYPES.has(contentType)) {
      throw new Error(
        'Floor-plan analysis currently supports JPG, PNG, and WebP',
      );
    }

    if (file.sizeBytes <= 0 || file.sizeBytes > MAX_SOURCE_BYTES) {
      throw new Error('Floor-plan image is too large');
    }
    const source = await this.storage.downloadBuffer(
      file.storageKey,
      MAX_SOURCE_BYTES,
    );
    if (source.length === 0 || source.length > MAX_SOURCE_BYTES) {
      throw new Error('Floor-plan image is empty or too large');
    }

    const normalized = await sharp(source)
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
      .toBuffer();

    return {
      name: 'floor-plan.jpg',
      mimeType: 'image/jpeg',
      bytes: normalized,
    };
  }
}
