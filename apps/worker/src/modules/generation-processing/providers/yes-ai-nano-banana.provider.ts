import { Injectable, Logger } from '@nestjs/common';
import {
  AiProvider,
  GenerateDesignInput,
  GeneratedDesignVariant,
} from './ai-provider.interface.js';
import {
  getYesAiNanoBananaConfig,
  YesAiNanoBananaConfig,
} from './yes-ai-nano-banana.config.js';
import { StorageService } from '../../storage/storage.service.js';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AiReferenceImageCacheService } from '../services/ai-reference-image-cache.service.js';

const RESULT_IMAGE_DOWNLOAD_TIMEOUT_SECONDS = 60;
const RESULT_IMAGE_CURL_CONNECT_TIMEOUT_SECONDS = 5;
const RESULT_IMAGE_CURL_RETRIES = 2;
const RESULT_IMAGE_CURL_RETRY_DELAY_SECONDS = 1;
const MAX_RESULT_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PRODUCT_REFERENCES = 6;
const MAX_REFERENCES = 10;
const PRODUCT_REFERENCE_CATEGORY_RANK = new Map(
  [
    'SOFA',
    'BED',
    'ARMCHAIR',
    'TABLE',
    'COFFEE_TABLE',
    'TV_STAND',
    'WARDROBE',
    'DRESSER',
    'SHELF',
    'DESK',
    'CHAIR',
    'RUG',
    'LAMP',
    'DECOR',
    'MATTRESS',
    'OTHER',
  ].map((category, index) => [category, index]),
);

type YesAiCreateGenerationResponse = {
  success: boolean;
  message: string;
  results?: {
    generation_data?: YesAiGenerationData;
  };
};

type YesAiGetGenerationResponse = {
  success: boolean;
  message: string;
  results?: {
    generation_data?: YesAiGenerationData;
    generations_data?: YesAiGenerationData;
  };
};

type YesAiGenerationData = {
  id: number;
  status: 0 | 1 | 2 | 3 | 4;
  status_description?: string;
  result_url?: string;
  comment_ru?: string;
  comment_en?: string;
  settings?: {
    customer_id?: string;
    dimensions?: string;
    references_urls?: string[];
    version?: string;
  };
};

@Injectable()
export class YesAiNanoBananaProvider implements AiProvider {
  providerName = 'NANO_BANANA' as const;

  private readonly logger = new Logger(YesAiNanoBananaProvider.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly aiReferenceImageCacheService: AiReferenceImageCacheService,
  ) {}

  async generateDesigns(
    input: GenerateDesignInput,
  ): Promise<GeneratedDesignVariant[]> {
    const config = getYesAiNanoBananaConfig();

    this.logger.log(
      `YES AI generation started: variantsCount=${input.variantsCount}, products=${input.products.length}, sourceImage=${Boolean(input.sourceImageUrl)}, initialPollDelayMs=${config.initialPollDelayMs}, pollIntervalMs=${config.pollIntervalMs}, timeoutMs=${config.timeoutMs}`,
    );

    await input.onProgress?.({
      progress: 5,
      currentStep: 'Готовим запрос к YES AI',
    });

    const variants: GeneratedDesignVariant[] = [];

    for (let index = 0; index < input.variantsCount; index += 1) {
      const variantNumber = index + 1;

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: starting create step`,
      );

      await input.onProgress?.({
        progress: this.getVariantStartProgress(index, input.variantsCount),
        currentStep: `Создаём AI-задачу для варианта ${variantNumber}`,
      });

      const generation = await this.createGeneration({
        config,
        input,
        variantNumber,
      });

      const externalJobId = String(generation.id);

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: external generation created externalJobId=${externalJobId}, status=${generation.status}, hasResultUrl=${Boolean(generation.result_url)}`,
      );

      await input.onProgress?.({
        progress: this.getVariantStartProgress(index, input.variantsCount),
        currentStep: `YES AI поставил вариант ${variantNumber} в очередь`,
        externalJobId,
      });

      const completedGeneration = await this.pollGeneration({
        config,
        externalJobId,
        input,
        variantIndex: index,
        variantNumber,
      });

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: polling completed externalJobId=${externalJobId}, status=${completedGeneration.status}, hasResultUrl=${Boolean(completedGeneration.result_url)}`,
      );

      if (!completedGeneration.result_url) {
        throw new Error('YES AI completed generation without result_url');
      }

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: downloading and uploading result externalJobId=${externalJobId}`,
      );

      const permanentImageUrl = await this.downloadAndUploadResultImage({
        resultUrl: completedGeneration.result_url,
        customerId: input.customerId,
        generationExternalId: externalJobId,
        variantNumber,
      });

      variants.push(
        this.createGeneratedVariant({
          input,
          imageUrl: permanentImageUrl,
          variantNumber,
        }),
      );

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: prepared generated variant externalJobId=${externalJobId}`,
      );
    }

    await input.onProgress?.({
      progress: 95,
      currentStep: 'Сохраняем варианты дизайна',
    });

    this.logger.log(`YES AI generation finished: variants=${variants.length}`);

    return variants;
  }

  private async createGeneration({
    config,
    input,
    variantNumber,
  }: {
    config: YesAiNanoBananaConfig;
    input: GenerateDesignInput;
    variantNumber: number;
  }): Promise<YesAiGenerationData> {
    const referencesUrls = await this.buildReferencesUrls(input);

    this.logVerbose(
      `YES AI create request started: variant=${variantNumber}, references=${referencesUrls?.length ?? 0}, version=${config.version}, dimensions=${config.dimensions}, resolution=${config.resolution}`,
    );

    const startedAt = Date.now();
    const response = await fetch(
      `${config.baseUrl}/v2/google/nanobanana/generations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: config.version,
          prompt: this.buildProviderPrompt(input, variantNumber),
          style: config.style,
          dimensions: config.dimensions,
          resolution: config.resolution,
          ...(referencesUrls?.length
            ? { references_urls: referencesUrls }
            : {}),
          customer_id: this.buildCustomerId(input),
        }),
      },
    );

    this.logVerbose(
      `YES AI create response received: variant=${variantNumber}, statusCode=${response.status}, elapsedMs=${Date.now() - startedAt}`,
    );

    const data = (await response.json()) as YesAiCreateGenerationResponse;

    if (!response.ok || !data.success) {
      this.logger.error(
        `YES AI create generation failed: ${JSON.stringify(data)}`,
      );

      throw new Error(
        `YES AI create generation failed: ${data.message ?? response.status}`,
      );
    }

    const generation = data.results?.generation_data;

    if (!generation?.id) {
      throw new Error('YES AI create response does not contain generation id');
    }

    return generation;
  }

  private async pollGeneration({
    config,
    externalJobId,
    input,
    variantIndex,
    variantNumber,
  }: {
    config: YesAiNanoBananaConfig;
    externalJobId: string;
    input: GenerateDesignInput;
    variantIndex: number;
    variantNumber: number;
  }): Promise<YesAiGenerationData> {
    const startedAt = Date.now();

    this.logVerbose(
      `YES AI poll waiting initial delay: externalJobId=${externalJobId}, variant=${variantNumber}, delayMs=${config.initialPollDelayMs}`,
    );

    await this.sleep(config.initialPollDelayMs);

    this.logVerbose(
      `YES AI poll started: externalJobId=${externalJobId}, variant=${variantNumber}, timeoutMs=${config.timeoutMs}`,
    );

    while (Date.now() - startedAt < config.timeoutMs) {
      const generation = await this.getGenerationStatus(config, externalJobId);

      this.logVerbose(
        `YES AI poll status: externalJobId=${externalJobId}, variant=${variantNumber}, status=${generation.status}, elapsedMs=${Date.now() - startedAt}, hasResultUrl=${Boolean(generation.result_url)}`,
      );

      await input.onProgress?.({
        progress: this.mapYesAiStatusToProgress({
          status: generation.status,
          variantIndex,
          variantsCount: input.variantsCount,
        }),
        currentStep: this.getStatusStep(generation.status, variantNumber),
        externalJobId,
      });

      if (generation.status === 2) {
        return generation;
      }

      if (generation.status === 3 || generation.status === 4) {
        throw new Error(
          [
            'YES AI generation rejected',
            `status=${generation.status}`,
            generation.status_description
              ? `description=${generation.status_description}`
              : null,
            generation.comment_ru
              ? `comment_ru=${generation.comment_ru}`
              : null,
            generation.comment_en
              ? `comment_en=${generation.comment_en}`
              : null,
          ]
            .filter(Boolean)
            .join('; '),
        );
      }

      await this.sleep(config.pollIntervalMs);
    }

    throw new Error('YES AI generation timeout');
  }

  private async getGenerationStatus(
    config: YesAiNanoBananaConfig,
    externalJobId: string,
  ): Promise<YesAiGenerationData> {
    this.logVerbose(
      `YES AI status request started: externalJobId=${externalJobId}`,
    );

    const startedAt = Date.now();
    const response = await fetch(
      `${config.baseUrl}/v2/google/nanobanana/generations/${externalJobId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    this.logVerbose(
      `YES AI status response received: externalJobId=${externalJobId}, statusCode=${response.status}, elapsedMs=${Date.now() - startedAt}`,
    );

    const data = (await response.json()) as YesAiGetGenerationResponse;

    if (!response.ok || !data.success) {
      this.logger.error(
        `YES AI get generation failed: ${JSON.stringify(data)}`,
      );

      throw new Error(
        `YES AI get generation failed: ${data.message ?? response.status}`,
      );
    }

    const generation =
      data.results?.generation_data ?? data.results?.generations_data;

    if (!generation) {
      throw new Error(
        'YES AI status response does not contain generation data',
      );
    }

    return generation;
  }

  private logVerbose(message: string) {
    if (process.env.GENERATION_VERBOSE_LOGS === 'true') {
      this.logger.debug(message);
    }
  }

  private buildProviderPrompt(
    input: GenerateDesignInput,
    variantNumber: number,
  ) {
    const sourceImageInstruction = input.sourceImageUrl
      ? [
          'Use the provided room photo as the base reference image.',
          'Preserve the room geometry, camera angle, windows, walls and proportions.',
          'Do not change structural layout.',
        ].join('\n')
      : [
          'Create a realistic interior scene from scratch.',
          'Use natural perspective and realistic room proportions.',
        ].join('\n');

    return [
      input.prompt,
      '',
      sourceImageInstruction,
      '',
      `Generate interior design variant ${variantNumber}.`,
      'The result must be photorealistic, cozy, commercially attractive, and suitable for an online furniture marketplace.',
      'Do not add text, watermark, logo, distorted furniture, broken perspective, extra doors, broken windows or unreadable objects.',
      input.negativePrompt ? `Negative prompt: ${input.negativePrompt}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async buildReferencesUrls(
    input: GenerateDesignInput,
  ): Promise<string[] | undefined> {
    const references: string[] = [];

    if (input.sourceImageUrl) {
      references.push(input.sourceImageUrl);
    }

    const productCandidates = input.products
      .map((product, originalIndex) => ({ product, originalIndex }))
      .sort((left, right) => {
        const leftRank =
          PRODUCT_REFERENCE_CATEGORY_RANK.get(left.product.category) ??
          Number.MAX_SAFE_INTEGER;
        const rightRank =
          PRODUCT_REFERENCE_CATEGORY_RANK.get(right.product.category) ??
          Number.MAX_SAFE_INTEGER;

        return leftRank - rightRank || left.originalIndex - right.originalIndex;
      })
      .map(({ product }) => ({
        productId: product.id,
        sourceUrl: product.imageUrls?.[0],
      }))
      .filter(
        (candidate): candidate is { productId: string; sourceUrl: string } =>
          Boolean(candidate.sourceUrl),
      )
      .slice(0, MAX_PRODUCT_REFERENCES)
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex(
            (other) => other.sourceUrl === candidate.sourceUrl,
          ) === index,
      );

    const cachedProductReferences = (
      await Promise.all(
        productCandidates.map(async ({ productId, sourceUrl }) => {
          try {
            return await this.aiReferenceImageCacheService.getOrCreateReference(
              { productId, sourceUrl },
            );
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : String(error);

            this.logger.warn(
              `Product reference image skipped: productId=${productId}, reason=${reason}`,
            );

            return undefined;
          }
        }),
      )
    ).filter((url): url is string => Boolean(url));

    references.push(...cachedProductReferences);

    const uniqueReferences = Array.from(new Set(references)).slice(
      0,
      MAX_REFERENCES,
    );

    this.logVerbose(
      `YES AI references prepared: total=${uniqueReferences.length}, hasSourceImage=${Boolean(input.sourceImageUrl)}, productReferences=${Math.max(
        0,
        uniqueReferences.filter(
          (reference) => reference !== input.sourceImageUrl,
        ).length,
      )}`,
    );

    if (uniqueReferences.length === 0) {
      return undefined;
    }

    return uniqueReferences;
  }

  private buildCustomerId(input: GenerateDesignInput): string {
    if (!input.customerId) {
      throw new Error('customerId is required for YES AI Nano Banana provider');
    }

    const customerId = input.customerId.replace(/\W/g, '_').slice(0, 100);

    if (!customerId) {
      throw new Error('customerId is empty after sanitization');
    }

    return customerId;
  }

  private createGeneratedVariant({
    input,
    imageUrl,
    variantNumber,
  }: {
    input: GenerateDesignInput;
    imageUrl: string;
    variantNumber: number;
  }): GeneratedDesignVariant {
    return {
      title:
        input.variantsCount === 1
          ? 'AI-вариант интерьера'
          : `AI-вариант ${variantNumber}`,
      description: `AI-дизайн комнаты в стиле ${input.style}.`,
      imageUrl,
      productIds: input.products.map((product) => product.id),
    };
  }

  private getStatusStep(status: number, variantNumber: number) {
    if (status === 0) return `Вариант ${variantNumber} ожидает в очереди`;
    if (status === 1) return `YES AI генерирует вариант ${variantNumber}`;
    if (status === 2) return `Вариант ${variantNumber} готов`;
    if (status === 3) return `Вариант ${variantNumber} отклонён`;
    if (status === 4) return `Вариант ${variantNumber} отклонён по таймауту`;

    return `Обрабатываем вариант ${variantNumber}`;
  }

  private getVariantStartProgress(index: number, variantsCount: number) {
    const min = 10;
    const max = 85;
    const segment = (max - min) / variantsCount;

    return Math.round(min + segment * index);
  }

  private mapYesAiStatusToProgress({
    status,
    variantIndex,
    variantsCount,
  }: {
    status: number;
    variantIndex: number;
    variantsCount: number;
  }) {
    const min = 10;
    const max = 85;
    const segment = (max - min) / variantsCount;
    const base = min + segment * variantIndex;

    const statusProgressMap: Record<number, number> = {
      0: 0.15,
      1: 0.65,
      2: 1,
      3: 1,
      4: 1,
    };

    return Math.round(base + segment * (statusProgressMap[status] ?? 0.3));
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async downloadAndUploadResultImage({
    resultUrl,
    customerId,
    generationExternalId,
    variantNumber,
  }: {
    resultUrl: string;
    customerId: string;
    generationExternalId: string;
    variantNumber: number;
  }) {
    this.logVerbose(
      `YES AI result download started: externalJobId=${generationExternalId}, variant=${variantNumber}`,
    );

    const downloadUrl = this.normalizeResultDownloadUrl({
      resultUrl,
      generationExternalId,
      variantNumber,
    });

    const { buffer, contentType } = await this.downloadResultImageBuffer({
      resultUrl: downloadUrl,
      generationExternalId,
      variantNumber,
    });

    if (buffer.length === 0) {
      throw new Error('YES AI result image is empty');
    }

    if (buffer.length > MAX_RESULT_IMAGE_BYTES) {
      throw new Error(
        `YES AI result image is too large: bytes=${buffer.length}, maxBytes=${MAX_RESULT_IMAGE_BYTES}`,
      );
    }

    const extension = this.getExtensionFromContentType(contentType);

    this.logVerbose(
      `YES AI result upload started: externalJobId=${generationExternalId}, variant=${variantNumber}, extension=${extension}, bytes=${buffer.length}`,
    );

    const uploaded = await this.storageService.uploadBuffer({
      buffer,
      contentType,
      extension,
      folder: [
        'generated-designs',
        this.sanitizePathPart(customerId),
        this.sanitizePathPart(generationExternalId),
      ].join('/'),
    });

    this.logVerbose(
      `Uploaded YES AI result image to S3: variant=${variantNumber}, key=${uploaded.key}`,
    );

    return uploaded.url;
  }

  private async downloadResultImageBuffer({
    resultUrl,
    generationExternalId,
    variantNumber,
  }: {
    resultUrl: string;
    generationExternalId: string;
    variantNumber: number;
  }) {
    const dir = await mkdtemp(join(tmpdir(), 'roomvi-yesai-'));
    const outputPath = join(dir, `${randomUUID()}.image`);
    const startedAt = Date.now();

    try {
      await this.execCurlResultDownloadToFile({
        resultUrl,
        outputPath,
        generationExternalId,
        variantNumber,
      });

      const fileStat = await stat(outputPath);

      if (fileStat.size === 0) {
        throw new Error('YES AI result image is empty after full download');
      }

      if (fileStat.size > MAX_RESULT_IMAGE_BYTES) {
        throw new Error(
          `YES AI result image is too large: bytes=${fileStat.size}, maxBytes=${MAX_RESULT_IMAGE_BYTES}`,
        );
      }

      const buffer = await readFile(outputPath);
      const detectedContentType = this.getContentTypeFromBuffer(buffer);

      this.logVerbose(
        `YES AI result image buffered: externalJobId=${generationExternalId}, variant=${variantNumber}, downloadMode=full, contentType=${detectedContentType}, bytes=${buffer.length}, elapsedMs=${Date.now() - startedAt}`,
      );

      if (!detectedContentType.startsWith('image/')) {
        throw new Error(
          `YES AI result is not an image. detectedContentType=${detectedContentType}, bytes=${buffer.length}`,
        );
      }

      return { buffer, contentType: detectedContentType };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private getExtensionFromContentType(contentType: string) {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('jpeg')) return 'jpg';
    if (contentType.includes('jpg')) return 'jpg';

    return 'png';
  }

  private normalizeResultDownloadUrl({
    resultUrl,
    generationExternalId,
    variantNumber,
  }: {
    resultUrl: string;
    generationExternalId: string;
    variantNumber: number;
  }) {
    let parsed: URL;

    try {
      parsed = new URL(resultUrl);
    } catch (error) {
      throw new Error(
        `YES AI result URL is invalid: externalJobId=${generationExternalId}, variant=${variantNumber}, error=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (parsed.hostname !== 'cf.yesai.su') {
      return resultUrl;
    }

    parsed.hostname = 'yesai.su';

    const normalizedUrl = parsed.toString();

    this.logVerbose(
      `YES AI result URL normalized for download: externalJobId=${generationExternalId}, variant=${variantNumber}, fromHost=cf.yesai.su, toHost=yesai.su`,
    );

    return normalizedUrl;
  }

  private execCurlResultDownloadToFile({
    resultUrl,
    outputPath,
    generationExternalId,
    variantNumber,
  }: {
    resultUrl: string;
    outputPath: string;
    generationExternalId: string;
    variantNumber: number;
  }) {
    this.logVerbose(
      `YES AI result full download started: externalJobId=${generationExternalId}, variant=${variantNumber}, timeoutSeconds=${RESULT_IMAGE_DOWNLOAD_TIMEOUT_SECONDS}`,
    );

    return this.execCurl([
      '--fail',
      '--location',
      '--http1.1',
      '--silent',
      '--show-error',
      '--max-time',
      String(RESULT_IMAGE_DOWNLOAD_TIMEOUT_SECONDS),
      '--connect-timeout',
      String(RESULT_IMAGE_CURL_CONNECT_TIMEOUT_SECONDS),
      '--retry',
      String(RESULT_IMAGE_CURL_RETRIES),
      '--retry-delay',
      String(RESULT_IMAGE_CURL_RETRY_DELAY_SECONDS),
      '--retry-all-errors',
      '--header',
      'Accept: image/png,image/jpeg,image/webp,image/*',
      '--output',
      outputPath,
      resultUrl,
    ]).catch((error) => {
      throw new Error(
        `YES AI result full download failed: externalJobId=${generationExternalId}, variant=${variantNumber}, curlRetries=${RESULT_IMAGE_CURL_RETRIES}, error=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  private execCurl(args: string[]) {
    return new Promise<{ stdout: Buffer; stderr: Buffer }>(
      (resolve, reject) => {
        execFile(
          'curl',
          args,
          {
            encoding: 'buffer',
            maxBuffer: 1024 * 1024,
            timeout:
              (RESULT_IMAGE_CURL_RETRIES + 1) *
              (RESULT_IMAGE_DOWNLOAD_TIMEOUT_SECONDS +
                RESULT_IMAGE_CURL_RETRY_DELAY_SECONDS +
                10) *
              1000,
          },
          (error, _stdout, stderr) => {
            if (error) {
              const stderrText = stderr.toString('utf8').trim();

              reject(
                new Error(
                  `curl failed to download YES AI result image: ${error.message}${
                    stderrText ? `; stderr=${stderrText}` : ''
                  }`,
                ),
              );
              return;
            }

            resolve({ stdout: _stdout, stderr });
          },
        );
      },
    );
  }

  private getContentTypeFromBuffer(buffer: Buffer) {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    return 'application/octet-stream';
  }

  private sanitizePathPart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  }
}
