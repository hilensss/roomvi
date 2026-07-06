import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { StorageService } from '../../storage/storage.service.js';

const CACHE_FOLDER = 'products/ai-reference-cache';
const CACHE_VERSION = 'v2';
const DEFAULT_MAX_SIZE_MB = 10;
const DEFAULT_MAX_DIMENSION = 768;
const DEFAULT_JPEG_QUALITY = 82;
const DEFAULT_MIN_OUTPUT_SIZE_KB = 5;
const DEFAULT_PUBLIC_CHECK_ATTEMPTS = 1;
const DEFAULT_PUBLIC_CHECK_DELAY_MS = 250;
const DEFAULT_PUBLIC_CHECK_TIMEOUT_MS = 1500;

type CacheProductReferenceInput = {
  sourceUrl: string;
  productId: string;
};

@Injectable()
export class AiReferenceImageCacheService {
  private readonly logger = new Logger(AiReferenceImageCacheService.name);
  private readonly maxSizeBytes =
    this.getPositiveIntegerEnv(
      'AI_REFERENCE_IMAGE_MAX_SIZE_MB',
      DEFAULT_MAX_SIZE_MB,
    ) *
    1024 *
    1024;
  private readonly maxDimension = this.getPositiveIntegerEnv(
    'AI_REFERENCE_IMAGE_MAX_DIMENSION',
    DEFAULT_MAX_DIMENSION,
  );
  private readonly jpegQuality = this.getPositiveIntegerEnv(
    'AI_REFERENCE_IMAGE_JPEG_QUALITY',
    DEFAULT_JPEG_QUALITY,
  );
  private readonly minOutputSizeBytes =
    this.getPositiveIntegerEnv(
      'AI_REFERENCE_IMAGE_MIN_SIZE_KB',
      DEFAULT_MIN_OUTPUT_SIZE_KB,
    ) * 1024;

  private readonly publicCheckEnabled =
    process.env.AI_REFERENCE_PUBLIC_CHECK_ENABLED !== 'false';
  private readonly publicCheckAttempts = this.getPositiveIntegerEnv(
    'AI_REFERENCE_PUBLIC_CHECK_ATTEMPTS',
    DEFAULT_PUBLIC_CHECK_ATTEMPTS,
  );
  private readonly publicCheckDelayMs = this.getPositiveIntegerEnv(
    'AI_REFERENCE_PUBLIC_CHECK_DELAY_MS',
    DEFAULT_PUBLIC_CHECK_DELAY_MS,
  );
  private readonly publicCheckTimeoutMs = this.getPositiveIntegerEnv(
    'AI_REFERENCE_PUBLIC_CHECK_TIMEOUT_MS',
    DEFAULT_PUBLIC_CHECK_TIMEOUT_MS,
  );

  constructor(private readonly storageService: StorageService) {}

  async getOrCreateReference({
    sourceUrl,
    productId,
  }: CacheProductReferenceInput): Promise<string> {
    const parsedUrl = this.parseHttpUrl(sourceUrl);

    if (this.isManagedSupportedImageUrl(parsedUrl)) {
      return parsedUrl.toString();
    }

    const hash = createHash('sha256')
      .update(`${CACHE_VERSION}\0${sourceUrl}`)
      .digest('hex')
      .slice(0, 40);
    const key = `${CACHE_FOLDER}/${hash}.jpg`;

    if (await this.storageService.objectExists(key)) {
      const cachedUrl = this.storageService.getPublicUrl(key);
      this.logger.log(`AI reference image cache hit: key=${key}`);
      return cachedUrl;
    }

    this.logger.log(
      `Downloading external product reference: productId=${productId}, sourceUrl=${sourceUrl}`,
    );

    const sourceBuffer = await this.downloadImage(parsedUrl);
    const jpegBuffer = await this.convertToCompatibleJpeg(sourceBuffer);

    const uploaded = await this.storageService.uploadBuffer({
      buffer: jpegBuffer,
      contentType: 'image/jpeg',
      extension: 'jpg',
      folder: CACHE_FOLDER,
      key,
    });

    await this.waitForPublicReferenceBestEffort(uploaded.url);

    this.logger.log(
      `AI reference image cached: productId=${productId}, sourceUrl=${sourceUrl}, url=${uploaded.url}, bytes=${jpegBuffer.length}`,
    );

    return uploaded.url;
  }

  private async downloadImage(sourceUrl: URL): Promise<Buffer> {
    const response = await fetch(sourceUrl, { redirect: 'follow' });

    if (!response.ok) {
      throw new Error(
        `download failed with status ${response.status} ${response.statusText}`,
      );
    }

    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();

    if (!contentType?.startsWith('image/')) {
      throw new Error(
        `download response is not an image: contentType=${contentType ?? 'missing'}`,
      );
    }

    const contentLength = this.parsePositiveInteger(
      response.headers.get('content-length'),
    );

    if (contentLength && contentLength > this.maxSizeBytes) {
      throw new Error(
        `image is too large: bytes=${contentLength}, maxBytes=${this.maxSizeBytes}`,
      );
    }

    if (!response.body) {
      throw new Error('download response body is empty');
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > this.maxSizeBytes) {
        await reader.cancel();
        throw new Error(
          `image is too large: bytes>${this.maxSizeBytes}, maxBytes=${this.maxSizeBytes}`,
        );
      }

      chunks.push(Buffer.from(value));
    }

    if (totalBytes === 0) {
      throw new Error('downloaded image is empty');
    }

    return Buffer.concat(chunks, totalBytes);
  }

  private async convertToCompatibleJpeg(sourceBuffer: Buffer): Promise<Buffer> {
    const quality = Math.min(100, this.jpegQuality);
    const standardJpeg = await this.encodeJpeg(sourceBuffer, {
      quality,
      chromaSubsampling: '4:2:0',
    });

    if (standardJpeg.length >= this.minOutputSizeBytes) {
      return standardJpeg;
    }

    const highQualityJpeg = await this.encodeJpeg(sourceBuffer, {
      quality: Math.max(95, quality),
      chromaSubsampling: '4:4:4',
    });

    if (highQualityJpeg.length >= this.minOutputSizeBytes) {
      return highQualityJpeg;
    }

    const metadataPaddingBytes =
      this.minOutputSizeBytes - highQualityJpeg.length + 2048;
    const paddedJpeg = await this.encodeJpeg(sourceBuffer, {
      quality: Math.max(95, quality),
      chromaSubsampling: '4:4:4',
      metadataPaddingBytes,
    });

    if (paddedJpeg.length < this.minOutputSizeBytes) {
      throw new Error(
        `normalized JPEG is too small: bytes=${paddedJpeg.length}, minBytes=${this.minOutputSizeBytes}`,
      );
    }

    return paddedJpeg;
  }

  private async encodeJpeg(
    sourceBuffer: Buffer,
    options: {
      quality: number;
      chromaSubsampling: '4:2:0' | '4:4:4';
      metadataPaddingBytes?: number;
    },
  ): Promise<Buffer> {
    let pipeline = sharp(sourceBuffer).rotate().resize({
      width: this.maxDimension,
      height: this.maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    });

    if (options.metadataPaddingBytes) {
      pipeline = pipeline.withMetadata({
        exif: {
          IFD0: {
            ImageDescription: 'Roomvi AI reference'.padEnd(
              options.metadataPaddingBytes,
              ' ',
            ),
          },
        },
      });
    }

    return pipeline
      .jpeg({
        quality: options.quality,
        chromaSubsampling: options.chromaSubsampling,
      })
      .toBuffer();
  }

  private async waitForPublicReferenceBestEffort(url: string): Promise<void> {
    if (!this.publicCheckEnabled) {
      return;
    }

    let lastReason = 'unknown error';

    for (let attempt = 1; attempt <= this.publicCheckAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.publicCheckTimeoutMs,
      );

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: { 'Cache-Control': 'no-cache' },
          signal: controller.signal,
        });
        const contentType = response.headers
          .get('content-type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase();
        const contentLength = this.parsePositiveInteger(
          response.headers.get('content-length'),
        );

        if (!response.ok) {
          lastReason = `status=${response.status}`;
        } else if (contentType !== 'image/jpeg') {
          lastReason = `contentType=${contentType ?? 'missing'}`;
        } else if (!contentLength || contentLength < this.minOutputSizeBytes) {
          lastReason = `bytes=${contentLength ?? 'missing'}, minBytes=${this.minOutputSizeBytes}`;
        } else {
          return;
        }
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
      } finally {
        clearTimeout(timeout);
      }

      this.logger.warn(
        `AI reference image public check failed: url=${url}, attempt=${attempt}/${this.publicCheckAttempts}, reason=${lastReason}`,
      );

      if (attempt < this.publicCheckAttempts) {
        await this.sleep(this.publicCheckDelayMs);
      }
    }

    this.logger.warn(
      `AI reference image public check failed after upload, returning URL anyway: url=${url}, reason=${lastReason}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isManagedSupportedImageUrl(sourceUrl: URL): boolean {
    const publicBaseUrl = new URL(this.storageService.getPublicUrl(''));
    const basePath = publicBaseUrl.pathname.replace(/\/$/, '');
    const isManagedUrl =
      sourceUrl.origin === publicBaseUrl.origin &&
      (sourceUrl.pathname === basePath ||
        sourceUrl.pathname.startsWith(`${basePath}/`));
    const isSupportedExtension = /\.(?:jpe?g|png)$/i.test(sourceUrl.pathname);

    return isManagedUrl && isSupportedExtension;
  }

  private parseHttpUrl(sourceUrl: string): URL {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      throw new Error('source URL is invalid');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`unsupported source URL protocol: ${parsedUrl.protocol}`);
    }

    return parsedUrl;
  }

  private getPositiveIntegerEnv(name: string, fallback: number): number {
    return this.parsePositiveInteger(process.env[name]) ?? fallback;
  }

  private parsePositiveInteger(value?: string | null): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
