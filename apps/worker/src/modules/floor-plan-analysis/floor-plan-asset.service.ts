import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { ReasoningAttachment } from '../reasoning-ai/reasoning-ai.types.js';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class FloorPlanAssetService {
  async loadNormalizedImage(url: string): Promise<ReasoningAttachment> {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Floor-plan URL must use HTTP or HTTPS');
    }

    const response = await fetch(parsedUrl, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(
        `Floor-plan download failed with status ${response.status}`,
      );
    }

    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !ACCEPTED_IMAGE_TYPES.has(contentType)) {
      throw new Error(
        'Floor-plan analysis currently supports JPG, PNG, and WebP',
      );
    }

    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_SOURCE_BYTES) {
      throw new Error('Floor-plan image is too large');
    }

    const source = Buffer.from(await response.arrayBuffer());
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
