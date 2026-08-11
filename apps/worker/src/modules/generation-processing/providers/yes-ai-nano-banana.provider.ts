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
import {
  getProductRenderProfile,
  getRenderPriorityRank,
} from '../product-render-profile.js';

const RESULT_IMAGE_DOWNLOAD_TIMEOUT_SECONDS = 60;
const RESULT_IMAGE_CURL_CONNECT_TIMEOUT_SECONDS = 5;
const RESULT_IMAGE_CURL_RETRIES = 2;
const RESULT_IMAGE_CURL_RETRY_DELAY_SECONDS = 1;
const MAX_RESULT_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PROVIDER_PROMPT_LENGTH = 10_000;
const MAX_REFERENCES = 10;
const TRANSPORT_MAX_ATTEMPTS = 2;
const DEFAULT_TRANSPORT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_HTTP_REQUEST_TIMEOUT_MS = 30_000;
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

export class YesAiProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'YesAiProviderError';
  }
}

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
      const variantStartedAt = Date.now();

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: starting create step`,
      );

      await input.onProgress?.({
        progress: this.getVariantStartProgress(index, input.variantsCount),
        currentStep: `Создаём AI-задачу для варианта ${variantNumber}`,
      });

      const created = await this.createGeneration({
        config,
        input,
        variantNumber,
      });
      const generation = created.generation;

      const externalJobId = String(generation.id);

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: external generation created externalJobId=${externalJobId}, status=${generation.status}, hasResultUrl=${Boolean(generation.result_url)}`,
      );

      await input.onProgress?.({
        progress: this.getVariantStartProgress(index, input.variantsCount),
        currentStep: `YES AI поставил вариант ${variantNumber} в очередь`,
        externalJobId,
      });

      const pollStartedAt = Date.now();
      const completedGeneration = await this.pollGeneration({
        config,
        externalJobId,
        input,
        variantIndex: index,
        variantNumber,
      });
      const pollMs = Date.now() - pollStartedAt;

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: polling completed externalJobId=${externalJobId}, status=${completedGeneration.status}, hasResultUrl=${Boolean(completedGeneration.result_url)}`,
      );

      if (!completedGeneration.result_url) {
        throw new Error('YES AI completed generation without result_url');
      }

      this.logVerbose(
        `YES AI variant ${variantNumber}/${input.variantsCount}: downloading and uploading result externalJobId=${externalJobId}`,
      );

      const resultTransfer = await this.downloadAndUploadResultImage({
        resultUrl: completedGeneration.result_url,
        customerId: input.customerId,
        generationExternalId: externalJobId,
        variantNumber,
      });
      const permanentImageUrl = resultTransfer.url;

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
      this.logger.log(
        `YES AI variant completed: externalJobId=${externalJobId}, variant=${variantNumber}/${input.variantsCount}, referencesMs=${created.referencesMs}, createMs=${created.createMs}, pollMs=${pollMs}, downloadMs=${resultTransfer.downloadMs}, uploadMs=${resultTransfer.uploadMs}, totalMs=${Date.now() - variantStartedAt}`,
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
  }): Promise<{
    generation: YesAiGenerationData;
    referencesMs: number;
    createMs: number;
  }> {
    const referencesStartedAt = Date.now();
    const preparedReferences = await this.prepareReferences(input);
    const referencesUrls = preparedReferences.urls;
    const referencesMs = Date.now() - referencesStartedAt;
    const providerPrompt = this.buildProviderPrompt(
      input,
      variantNumber,
      preparedReferences.contractLines,
    );

    if (input.sourceShell) {
      this.logger.log(
        `B2B render request: roomId=${input.b2bRoomId ?? 'unknown'}, roomType=${input.roomType}, products=${input.products.length}, sourceShell=true, shellReferenceIndex=1, promptLength=${providerPrompt.length}, references=${referencesUrls?.length ?? 0}, endpoint=/v2/google/nanobanana/generations, requestMode=references_urls`,
      );
    }

    this.logVerbose(
      `YES AI create request started: variant=${variantNumber}, references=${referencesUrls?.length ?? 0}, productReferences=${preparedReferences.productReferenceCount}, version=${config.version}, dimensions=${config.dimensions}, resolution=${config.resolution}`,
    );

    const startedAt = Date.now();
    const response = await this.fetchWithTransientRetry(
      `${config.baseUrl}/v2/google/nanobanana/generations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: config.version,
          prompt: providerPrompt,
          style: config.style,
          dimensions: config.dimensions,
          resolution: config.resolution,
          ...(referencesUrls?.length
            ? { references_urls: referencesUrls }
            : {}),
          customer_id: this.buildCustomerId(input),
        }),
      },
      'create',
    );

    this.logVerbose(
      `YES AI create response received: variant=${variantNumber}, statusCode=${response.status}, elapsedMs=${Date.now() - startedAt}`,
    );

    const data = await this.readJsonResponse<YesAiCreateGenerationResponse>(
      response,
    );

    if (!response.ok || !data?.success) {
      this.logger.error(
        `YES AI create generation failed: status=${response.status}, code=${data?.message ?? 'invalid_response'}`,
      );

      throw new YesAiProviderError(
        `YES AI create generation failed: ${data?.message ?? response.status}`,
        response.status,
        data?.message,
      );
    }

    const generation = data.results?.generation_data;

    if (!generation?.id) {
      throw new Error('YES AI create response does not contain generation id');
    }

    return {
      generation,
      referencesMs,
      createMs: Date.now() - startedAt,
    };
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
    const response = await this.fetchWithTransientRetry(
      `${config.baseUrl}/v2/google/nanobanana/generations/${externalJobId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      'status',
    );

    this.logVerbose(
      `YES AI status response received: externalJobId=${externalJobId}, statusCode=${response.status}, elapsedMs=${Date.now() - startedAt}`,
    );

    const data = await this.readJsonResponse<YesAiGetGenerationResponse>(
      response,
    );

    if (!response.ok || !data?.success) {
      this.logger.error(
        `YES AI get generation failed: status=${response.status}, code=${data?.message ?? 'invalid_response'}`,
      );

      throw new YesAiProviderError(
        `YES AI get generation failed: ${data?.message ?? response.status}`,
        response.status,
        data?.message,
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

  private async readJsonResponse<T>(response: Response): Promise<T | null> {
    const responseText = await response.text();

    try {
      return JSON.parse(responseText) as T;
    } catch {
      return null;
    }
  }

  private buildProviderPrompt(
    input: GenerateDesignInput,
    variantNumber: number,
    referenceContractLines: string[] = [],
  ) {
    const sourceImageInstruction = input.sourceShell
      ? null
      : input.sourceImageUrl
        ? 'SOURCE_ROOM is strict: preserve camera, walls, windows, doors, floor, ceiling and proportions.'
      : 'Create realistic room geometry with natural perspective and proportions.';

    const essentialPrompt = [
      input.prompt,
      ...(referenceContractLines.length
        ? ['', 'ATTACHED REFERENCE IMAGE MAP:', ...referenceContractLines]
        : []),
      '',
      sourceImageInstruction,
      '',
      `Generate interior variant ${variantNumber}.`,
      'Photorealistic, residential, commercially attractive. No text, watermark, logo, broken geometry or distorted furniture.',
    ]
      .filter(Boolean)
      .join('\n');

    if (essentialPrompt.length > MAX_PROVIDER_PROMPT_LENGTH) {
      if (input.sourceShell) {
        throw new Error(
          `B2B provider prompt exceeds ${MAX_PROVIDER_PROMPT_LENGTH} character limit: ${essentialPrompt.length}`,
        );
      }
      const fixedTail = [
        '',
        sourceImageInstruction,
        '',
        `Generate interior variant ${variantNumber}.`,
        'Photorealistic residential interior. No text, watermark, logo, broken geometry or distorted furniture.',
      ].join('\n');
      const maxBaseLength = Math.max(
        0,
        MAX_PROVIDER_PROMPT_LENGTH - fixedTail.length - 1,
      );
      return `${input.prompt.slice(0, maxBaseLength).trimEnd()}\n${fixedTail}`;
    }

    if (!input.negativePrompt) return essentialPrompt;

    const negativePrefix = '\nNegative prompt: ';
    const remainingLength =
      MAX_PROVIDER_PROMPT_LENGTH -
      essentialPrompt.length -
      negativePrefix.length;

    if (remainingLength <= 0) return essentialPrompt;

    return `${essentialPrompt}${negativePrefix}${input.negativePrompt.slice(
      0,
      remainingLength,
    )}`;
  }

  private async prepareReferences(input: GenerateDesignInput): Promise<{
    urls?: string[];
    contractLines: string[];
    productReferenceCount: number;
  }> {
    const references: string[] = [];
    const contractLines: string[] = [];

    if (input.sourceImageUrl) {
      references.push(input.sourceImageUrl);
      contractLines.push(
        input.sourceShell
          ? 'REF_1=SOURCE_SHELL;geometry/camera/openings;primary;strict;not-product.'
          : 'REF_1=SOURCE_ROOM; geometry/camera/openings only; not a product.',
      );
    }

    const originalIndexById = new Map(
      input.products.map((product, index) => [product.id, index]),
    );
    const availableProductSlots = Math.max(
      0,
      MAX_REFERENCES - references.length,
    );

    const productCandidates = input.products
      .map((product) => ({
        product,
        originalIndex: originalIndexById.get(product.id) ?? 0,
        profile: getProductRenderProfile(product),
        sourceUrl: product.imageUrls?.[0],
      }))
      .filter((candidate) => Boolean(candidate.sourceUrl))
      .sort((left, right) => {
        const priorityDelta =
          getRenderPriorityRank(left.profile.priority) -
          getRenderPriorityRank(right.profile.priority);
        return priorityDelta || left.originalIndex - right.originalIndex;
      })
      .filter(
        (candidate, index, candidates) =>
          candidates.findIndex(
            (other) => other.sourceUrl === candidate.sourceUrl,
          ) === index,
      )
      .slice(0, availableProductSlots);

    const resolvedProductReferences = await Promise.all(
      productCandidates.map(async (candidate) => {
        try {
          const url =
            await this.aiReferenceImageCacheService.getOrCreateReference({
              productId: candidate.product.id,
              sourceUrl: candidate.sourceUrl!,
            });
          return { ...candidate, url };
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Product reference image skipped: productId=${candidate.product.id}, reason=${reason}`,
          );
          return undefined;
        }
      }),
    );

    for (const resolved of resolvedProductReferences) {
      if (!resolved) continue;
      if (references.includes(resolved.url)) continue;

      references.push(resolved.url);
      const referenceIndex = references.length;
      const productLabel = `PRODUCT_${resolved.originalIndex + 1}`;
      contractLines.push(
        [
          `REF_${referenceIndex}=${productLabel}`,
          `cat=${resolved.product.category}`,
          `sub=${resolved.profile.subtype}`,
          'strict',
          'once',
          'no-duplicate',
        ].join(';'),
      );
    }

    const productReferenceCount = Math.max(
      0,
      references.length - (input.sourceImageUrl ? 1 : 0),
    );

    this.logVerbose(
      `YES AI references prepared: total=${references.length}, hasSourceImage=${Boolean(input.sourceImageUrl)}, productReferences=${productReferenceCount}, selectedProducts=${input.products.length}`,
    );

    if (references.length === 0) {
      return { urls: undefined, contractLines: [], productReferenceCount: 0 };
    }

    return {
      urls: references,
      contractLines,
      productReferenceCount,
    };
  }

  private async fetchWithTransientRetry(
    url: string,
    init: RequestInit,
    operation: 'create' | 'status',
  ) {
    const timeoutMs = this.getPositiveIntegerEnv(
      'YESAI_HTTP_REQUEST_TIMEOUT_MS',
      DEFAULT_HTTP_REQUEST_TIMEOUT_MS,
    );
    const retryBaseDelayMs = this.getNonNegativeIntegerEnv(
      'YESAI_TRANSPORT_RETRY_BASE_DELAY_MS',
      DEFAULT_TRANSPORT_RETRY_BASE_DELAY_MS,
    );

    for (let attempt = 1; attempt <= TRANSPORT_MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });
        if (
          attempt < TRANSPORT_MAX_ATTEMPTS &&
          (response.status === 429 || response.status >= 500)
        ) {
          this.logger.warn(
            `YES AI transport retry: operation=${operation}, attempt=${attempt}/${TRANSPORT_MAX_ATTEMPTS}, status=${response.status}, retryInMs=${retryBaseDelayMs * attempt}`,
          );
          await this.sleep(retryBaseDelayMs * attempt);
          continue;
        }
        return response;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          attempt === TRANSPORT_MAX_ATTEMPTS ||
          !this.isTransientTransportError(error)
        ) {
          throw error;
        }
        const cause = this.transportCause(error);
        const retryInMs = retryBaseDelayMs * attempt;
        this.logger.warn(
          `YES AI transport retry: operation=${operation}, attempt=${attempt}/${TRANSPORT_MAX_ATTEMPTS}, causeName=${cause.name}, causeCode=${cause.code}, causeMessage=${cause.message}, retryInMs=${retryInMs}`,
        );
        await this.sleep(retryInMs);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('Unreachable YES AI transport retry state');
  }

  private isTransientTransportError(error: unknown) {
    if (!(error instanceof Error)) return false;
    const cause = this.transportCause(error);
    return (
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.message.toLowerCase().includes('fetch failed') ||
      ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(
        cause.code,
      )
    );
  }

  private transportCause(error: Error) {
    const cause = (error as Error & {
      cause?: { code?: unknown; name?: unknown; message?: unknown };
    }).cause;
    return {
      name:
        typeof cause?.name === 'string'
          ? cause.name
          : error.name || 'Error',
      code: typeof cause?.code === 'string' ? cause.code : 'unknown',
      message:
        typeof cause?.message === 'string'
          ? cause.message
          : error.message || 'unknown',
    };
  }

  private getPositiveIntegerEnv(name: string, fallback: number) {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private getNonNegativeIntegerEnv(name: string, fallback: number) {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

    const downloadStartedAt = Date.now();
    const { buffer, contentType } = await this.downloadResultImageBuffer({
      resultUrl: downloadUrl,
      generationExternalId,
      variantNumber,
    });
    const downloadMs = Date.now() - downloadStartedAt;

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

    const uploadStartedAt = Date.now();
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
    const uploadMs = Date.now() - uploadStartedAt;

    this.logVerbose(
      `Uploaded YES AI result image to S3: variant=${variantNumber}, key=${uploaded.key}`,
    );

    return { url: uploaded.url, downloadMs, uploadMs };
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
