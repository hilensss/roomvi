import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GenerationJobStatus,
  GenerationOwnerType,
  Product,
  RoomProjectStatus,
} from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderFactory } from './providers/ai-provider.factory.js';
import {
  AiGenerationProgress,
  AiProvider,
  GeneratedDesignVariant,
} from './providers/ai-provider.interface.js';
import { PromptBuilderService } from './prompt-builder.service.js';
import { createProductSnapshot } from './utils/product-snapshot.util.js';
import { ProductMatchingService } from './product-matching.service.js';

const GENERATION_VARIANT_CONCURRENCY = 2;
const GENERATION_VARIANT_RETRIES = 3;
const DEFAULT_GENERATION_VARIANT_RETRY_BASE_DELAY_MS = 1_000;
const GENERATION_PROGRESS_START = 12;
const GENERATION_PROGRESS_END = 88;
const GENERATION_PROGRESS_UPDATE_INTERVAL_MS = 2_000;

type PreparedVariant = {
  variantNumber: number;
  products: Product[];
  prompt: string;
  negativePrompt: string;
};

type VariantProgressState = {
  progress: number;
  status:
    | 'pending'
    | 'creating'
    | 'queued'
    | 'generating'
    | 'ready'
    | 'saving'
    | 'failed';
  externalJobId?: string;
};

@Injectable()
export class GenerationProcessingService {
  private readonly logger = new Logger(GenerationProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly aiProviderFactory: AiProviderFactory,
    private readonly productMatchingService: ProductMatchingService,
  ) {}

  async processGenerationJob(generationJobId: string): Promise<unknown> {
    this.logger.log(`Generation job ${generationJobId}: loading job record`);

    const generationJob = await this.prisma.generationJob.findUnique({
      where: { id: generationJobId },
      include: { roomProject: true },
    });

    if (!generationJob) throw new NotFoundException('Generation job not found');

    this.logger.log(
      `Generation job ${generationJob.id}: loaded status=${generationJob.status}, provider=${generationJob.provider}, roomProjectId=${generationJob.roomProjectId}`,
    );

    if (generationJob.status === GenerationJobStatus.COMPLETED) {
      this.logger.log(`Generation job ${generationJob.id} already completed`);
      return generationJob;
    }

    this.logger.log(
      `Generation job ${generationJob.id}: marking job and project as processing`,
    );

    await this.prisma.generationJob.update({
      where: { id: generationJob.id },
      data: {
        status: GenerationJobStatus.PROCESSING,
        startedAt: new Date(),
        errorMessage: null,
        progress: 1,
        currentStep: 'Подбираем товары из каталога',
      },
    });

    await this.prisma.roomProject.update({
      where: { id: generationJob.roomProjectId },
      data: { status: RoomProjectStatus.GENERATING },
    });

    this.logger.log(
      `Generation job ${generationJob.id}: processing state saved`,
    );

    const project = generationJob.roomProject;

    try {
      const variantsCount =
        generationJob.ownerType === GenerationOwnerType.GUEST ? 2 : 4;
      const variantProgress = new Map<number, VariantProgressState>();

      for (
        let variantNumber = 1;
        variantNumber <= variantsCount;
        variantNumber += 1
      ) {
        variantProgress.set(variantNumber, {
          progress: 0,
          status: 'pending',
        });
      }

      const aiProvider = this.aiProviderFactory.getProvider(
        generationJob.provider,
      );

      this.logger.log(
        `Generation job ${generationJob.id}: preparing ${variantsCount} product sets roomType=${project.roomType}, style=${project.style}, budgetMax=${project.budgetMax ?? 'none'}, provider=${aiProvider.providerName}, sourceImage=${Boolean(project.sourceImageUrl)}`,
      );

      await this.updateProgress(generationJob.id, {
        progress: 8,
        currentStep: 'Подбираем товары из каталога',
      });

      const preparedVariants: PreparedVariant[] = [];
      const productById = new Map<string, Product>();
      const usedProductIds = new Set<string>();
      let firstPrompt: string | null = null;
      let firstNegativePrompt: string | null = null;

      for (
        let variantNumber = 1;
        variantNumber <= variantsCount;
        variantNumber += 1
      ) {
        if (this.isVerboseGenerationLoggingEnabled()) {
          this.logger.debug(
            `Generation job ${generationJob.id}: selecting AI products for variant=${variantNumber}/${variantsCount}`,
          );
        }

        const productSet =
          await this.productMatchingService.buildProductSetForVariant({
            roomType: project.roomType,
            style: project.style,
            budgetMin: project.budgetMin ?? undefined,
            budgetMax: project.budgetMax ?? undefined,
            widthCm: project.widthCm ?? undefined,
            depthCm: project.depthCm ?? undefined,
            variantNumber,
            excludeProductIds:
              variantNumber <= 3 ? Array.from(usedProductIds) : [],
          });

        const products = productSet.products;

        if (products.length === 0) {
          this.logger.warn(
            `Generation job ${generationJob.id}: no matching products found for variant=${variantNumber}`,
          );

          continue;
        }

        for (const product of products) {
          productById.set(product.id, product);
          usedProductIds.add(product.id);
        }

        if (productSet.missingRequiredCategories.length > 0) {
          this.logger.warn(
            `Generation job ${generationJob.id}: variant=${variantNumber} missing required categories=${productSet.missingRequiredCategories.join(',')}`,
          );
        }

        if (this.isVerboseGenerationLoggingEnabled()) {
          this.logger.debug(
            `Generation job ${generationJob.id}: selected coherent product set variant=${variantNumber}/${variantsCount}, products=${products.length}, totalPrice=${productSet.totalPrice}`,
          );
          this.logger.debug(
            `Generation job ${generationJob.id}: building prompt for variant=${variantNumber}/${variantsCount}`,
          );
        }

        const promptResult = this.promptBuilder.buildPromptWithinLimit(
          {
            roomType: project.roomType,
            style: project.style,
            title: project.title ?? undefined,
            budgetMin: project.budgetMin ?? undefined,
            budgetMax: project.budgetMax ?? undefined,
            widthCm: project.widthCm ?? undefined,
            heightCm: project.heightCm ?? undefined,
            depthCm: project.depthCm ?? undefined,
            sourceImageUrl: project.sourceImageUrl ?? undefined,
          },
          products,
          9500,
        );
        const prompt = promptResult.prompt;

        this.logger.log(
          `Generation prompt prepared: mode=${promptResult.mode}, length=${prompt.length}, productsIncluded=${promptResult.includedProductsCount}/${promptResult.totalProductsCount}`,
        );

        const negativePrompt = this.promptBuilder.buildNegativePrompt(
          {
            roomType: project.roomType,
            style: project.style,
            title: project.title ?? undefined,
            budgetMin: project.budgetMin ?? undefined,
            budgetMax: project.budgetMax ?? undefined,
            widthCm: project.widthCm ?? undefined,
            heightCm: project.heightCm ?? undefined,
            depthCm: project.depthCm ?? undefined,
            sourceImageUrl: project.sourceImageUrl ?? undefined,
          },
          products,
        );

        if (!firstPrompt || !firstNegativePrompt) {
          firstPrompt = prompt;
          firstNegativePrompt = negativePrompt;
        }

        preparedVariants.push({
          variantNumber,
          products,
          prompt,
          negativePrompt,
        });
      }

      if (preparedVariants.length === 0) {
        this.logger.warn(
          `Generation job ${generationJob.id}: no generated variants were produced`,
        );

        throw new BadRequestException(
          'No generated variants were produced because no matching products were found',
        );
      }

      await this.prisma.generationJob.update({
        where: { id: generationJob.id },
        data: {
          prompt: firstPrompt,
          negativePrompt: firstNegativePrompt,
          progress: GENERATION_PROGRESS_START,
          currentStep: 'Готовим AI-промпты',
        },
      });

      this.logger.log(
        `Generation job ${generationJob.id}: product sets prepared variants=${preparedVariants.length}/${variantsCount}`,
      );

      const generatedVariants = await this.generatePreparedVariants({
        generationJob,
        roomType: project.roomType,
        style: project.style,
        sourceImageUrl: project.sourceImageUrl,
        variantsCount,
        variantProgress,
        aiProvider,
        preparedVariants,
      });

      if (generatedVariants.length === 0) {
        this.logger.warn(
          `Generation job ${generationJob.id}: AI provider produced no variants`,
        );

        throw new BadRequestException(
          'No generated variants were produced by the AI provider',
        );
      }

      await this.updateProgress(generationJob.id, {
        progress: 90,
        currentStep: 'Сохраняем варианты дизайна',
      });

      await this.updateProgress(generationJob.id, {
        progress: 94,
        currentStep: 'Связываем дизайн с товарами',
      });

      const createdVariants = [];

      for (const generatedVariant of generatedVariants) {
        const variantNumber = createdVariants.length + 1;
        const variantProducts = generatedVariant.productIds.length
          ? (generatedVariant.productIds
              .map((id) => productById.get(id))
              .filter(Boolean) as Product[])
          : [];

        const totalPrice = variantProducts.reduce((sum, p) => sum + p.price, 0);

        this.logger.log(
          `Generation job ${generationJob.id}: creating DesignVariant ${variantNumber}/${generatedVariants.length}, linkedProducts=${variantProducts.length}, totalPrice=${totalPrice}`,
        );

        const createdVariant = await this.prisma.designVariant.create({
          data: {
            roomProjectId: project.id,
            generationJobId: generationJob.id,
            title: generatedVariant.title,
            description: generatedVariant.description,
            imageUrl: generatedVariant.imageUrl,
            totalPrice,
            currency: 'RUB',
            products: {
              create: variantProducts.map((p) => ({
                productId: p.id,
                role: p.category,
                productSnapshot: createProductSnapshot(p),
              })),
            },
          },
          include: { products: { include: { product: true } } },
        });

        this.logger.log(
          `Generation job ${generationJob.id}: created DesignVariant ${createdVariant.id}`,
        );

        createdVariants.push(createdVariant);
      }

      this.logger.log(`Generation job ${generationJob.id}: marking completed`);

      const completedJob = await this.prisma.generationJob.update({
        where: { id: generationJob.id },
        data: {
          status: GenerationJobStatus.COMPLETED,
          progress: 100,
          currentStep: 'Готово',
          completedAt: new Date(),
        },
      });

      const updatedProject = await this.prisma.roomProject.update({
        where: { id: project.id },
        data: { status: RoomProjectStatus.GENERATED },
      });

      this.logger.log(
        `Generation job ${generationJob.id}: completed variants=${createdVariants.length}`,
      );

      return {
        project: updatedProject,
        job: completedJob,
        variants: createdVariants,
      };
    } catch (error) {
      this.logger.error(
        `Generation job ${generationJob.id}: failed with ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.prisma.generationJob.update({
        where: { id: generationJob.id },
        data: {
          status: GenerationJobStatus.FAILED,
          progress: 100,
          currentStep: 'Ошибка генерации',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown generation error',
          completedAt: new Date(),
        },
      });

      await this.prisma.roomProject.update({
        where: { id: project.id },
        data: { status: RoomProjectStatus.DRAFT },
      });

      throw error;
    }
  }

  private normalizeProviderStatus(
    step: string,
  ): VariantProgressState['status'] {
    const normalizedStep = step.toLocaleLowerCase('ru-RU');

    if (
      normalizedStep.includes('готовим запрос') ||
      normalizedStep.includes('создаём ai-задачу')
    ) {
      return 'creating';
    }

    if (
      normalizedStep.includes('поставил') ||
      normalizedStep.includes('очеред')
    ) {
      return 'queued';
    }

    if (normalizedStep.includes('генерирует')) return 'generating';
    if (normalizedStep.includes('сохраняем')) return 'saving';
    if (normalizedStep.includes('готов')) return 'ready';

    return 'generating';
  }

  private computeGenerationProgress(
    variantProgress: Map<number, VariantProgressState>,
  ) {
    const states = Array.from(variantProgress.values());
    const averageProgress =
      states.reduce((sum, state) => sum + state.progress, 0) / states.length;

    return Math.round(
      GENERATION_PROGRESS_START +
        averageProgress *
          ((GENERATION_PROGRESS_END - GENERATION_PROGRESS_START) / 100),
    );
  }

  private getCompletedVariantsCount(
    variantProgress: Map<number, VariantProgressState>,
  ) {
    return Array.from(variantProgress.values()).filter(
      ({ status }) => status === 'ready' || status === 'saving',
    ).length;
  }

  private getPublicGenerationStep(
    variantProgress: Map<number, VariantProgressState>,
    variantsCount: number,
  ) {
    const completed = this.getCompletedVariantsCount(variantProgress);

    return completed === variantsCount
      ? 'Сохраняем варианты дизайна'
      : `Генерируем варианты интерьера: готово ${completed} из ${variantsCount}`;
  }

  private async generatePreparedVariants({
    generationJob,
    roomType,
    style,
    sourceImageUrl,
    variantsCount,
    variantProgress,
    aiProvider,
    preparedVariants,
  }: {
    generationJob: {
      id: string;
      userId: string | null;
      guestSessionId: string | null;
    };
    roomType: Parameters<AiProvider['generateDesigns']>[0]['roomType'];
    style: Parameters<AiProvider['generateDesigns']>[0]['style'];
    sourceImageUrl: string | null;
    variantsCount: number;
    variantProgress: Map<number, VariantProgressState>;
    aiProvider: AiProvider;
    preparedVariants: PreparedVariant[];
  }): Promise<GeneratedDesignVariant[]> {
    const results = new Array<GeneratedDesignVariant[]>(
      preparedVariants.length,
    );
    let nextIndex = 0;
    let completedResultsCount = 0;
    let terminalError: unknown;
    let lastSavedProgress = GENERATION_PROGRESS_START;
    let lastSavedStep = 'Готовим AI-промпты';
    let lastProgressUpdateAt = 0;
    let latestExternalJobId: string | undefined;
    let progressWriteQueue = Promise.resolve();

    const saveAggregatedProgress = async (force = false) => {
      const now = Date.now();
      const progress = Math.max(
        lastSavedProgress,
        this.computeGenerationProgress(variantProgress),
      );
      const currentStep = this.getPublicGenerationStep(
        variantProgress,
        variantsCount,
      );
      const changed =
        progress !== lastSavedProgress || currentStep !== lastSavedStep;

      if (!changed) return;

      if (
        !force &&
        now - lastProgressUpdateAt < GENERATION_PROGRESS_UPDATE_INTERVAL_MS
      ) {
        return;
      }

      lastSavedProgress = progress;
      lastSavedStep = currentStep;
      lastProgressUpdateAt = now;

      const nextProgressUpdate = progressWriteQueue.then(() =>
        this.updateProgress(generationJob.id, {
          progress,
          currentStep,
          externalJobId: latestExternalJobId,
        }),
      );

      progressWriteQueue = nextProgressUpdate.catch(() => undefined);
      await nextProgressUpdate;
    };

    const reportVariantProgress = async (
      plan: PreparedVariant,
      { progress, currentStep, externalJobId }: AiGenerationProgress,
    ) => {
      const previous = variantProgress.get(plan.variantNumber) ?? {
        progress: 0,
        status: 'pending' as const,
      };
      const normalizedStatus = this.normalizeProviderStatus(currentStep);
      const completedBefore =
        previous.status === 'ready' || previous.status === 'saving';
      const completedAfter =
        normalizedStatus === 'ready' || normalizedStatus === 'saving';
      const clampedProgress = Math.max(0, Math.min(100, progress));

      variantProgress.set(plan.variantNumber, {
        progress: Math.max(previous.progress, clampedProgress),
        status: normalizedStatus,
        externalJobId: externalJobId ?? previous.externalJobId,
      });

      if (externalJobId) latestExternalJobId = externalJobId;

      if (this.isVerboseGenerationLoggingEnabled()) {
        this.logger.debug(
          `Generation job ${generationJob.id}: provider progress variant=${plan.variantNumber}/${variantsCount}, providerProgress=${progress}, providerStep="${currentStep}", status=${normalizedStatus}, externalJobId=${externalJobId ?? 'none'}`,
        );
      }

      await saveAggregatedProgress(completedAfter && !completedBefore);
    };

    const runWorker = async () => {
      while (!terminalError) {
        const planIndex = nextIndex;
        nextIndex += 1;

        if (planIndex >= preparedVariants.length) return;

        const plan = preparedVariants[planIndex];

        if (this.isVerboseGenerationLoggingEnabled()) {
          this.logger.debug(
            `Generation job ${generationJob.id}: calling AI provider variant=${plan.variantNumber}/${variantsCount}, provider=${aiProvider.providerName}, products=${plan.products.length}, promptLength=${plan.prompt.length}, negativePromptLength=${plan.negativePrompt.length}`,
          );
        }

        try {
          results[planIndex] = await this.generateVariantWithRetry(
            generationJob.id,
            plan.variantNumber,
            () =>
              aiProvider.generateDesigns({
                prompt: plan.prompt,
                negativePrompt: plan.negativePrompt,
                roomType,
                style,
                products: plan.products,
                variantsCount: 1,
                customerId: `${this.buildAiCustomerId(generationJob)}_variant_${plan.variantNumber}`,
                sourceImageUrl: sourceImageUrl ?? undefined,
                onProgress: async ({
                  progress,
                  currentStep,
                  externalJobId,
                }) => {
                  await reportVariantProgress(plan, {
                    progress,
                    currentStep,
                    externalJobId,
                  });
                },
              }),
          );

          const previous = variantProgress.get(plan.variantNumber) ?? {
            progress: 0,
            status: 'pending' as const,
          };

          variantProgress.set(plan.variantNumber, {
            ...previous,
            progress: 100,
            status: 'ready',
          });

          completedResultsCount += 1;
          this.logger.log(
            `Generation job ${generationJob.id}: variant completed ${completedResultsCount}/${variantsCount}`,
          );
          await saveAggregatedProgress(true);
        } catch (error) {
          const previous = variantProgress.get(plan.variantNumber) ?? {
            progress: 0,
            status: 'pending' as const,
          };

          variantProgress.set(plan.variantNumber, {
            ...previous,
            status: 'failed',
          });
          terminalError ??= error;
        }
      }
    };

    const workerCount = Math.min(
      GENERATION_VARIANT_CONCURRENCY,
      preparedVariants.length,
    );

    this.logger.log(
      `Generation job ${generationJob.id}: generation started with concurrency=${workerCount}, variants=${preparedVariants.length}`,
    );
    await saveAggregatedProgress(true);

    await Promise.allSettled(
      Array.from({ length: workerCount }, () => runWorker()),
    );
    await progressWriteQueue;

    if (terminalError) throw terminalError;

    return results.flat();
  }

  private async generateVariantWithRetry<T>(
    generationJobId: string,
    variantNumber: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const maximumAttempts = GENERATION_VARIANT_RETRIES + 1;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maximumAttempts) throw error;

        const delayMs = this.getRetryBaseDelayMs() * 2 ** (attempt - 1);

        this.logger.warn(
          `Generation job ${generationJobId}: provider call failed variant=${variantNumber}, attempt=${attempt}/${maximumAttempts}, retryInMs=${delayMs}, error=${error instanceof Error ? error.message : String(error)}`,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error('Unreachable generation retry state');
  }

  private getRetryBaseDelayMs() {
    const configured = Number(
      process.env.GENERATION_VARIANT_RETRY_BASE_DELAY_MS ??
        DEFAULT_GENERATION_VARIANT_RETRY_BASE_DELAY_MS,
    );

    return Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_GENERATION_VARIANT_RETRY_BASE_DELAY_MS;
  }

  private isVerboseGenerationLoggingEnabled() {
    return process.env.GENERATION_VERBOSE_LOGS === 'true';
  }

  private async updateProgress(
    generationJobId: string,
    data: {
      progress: number;
      currentStep: string;
      externalJobId?: string;
    },
  ) {
    const progress = Math.max(0, Math.min(100, data.progress));

    if (this.isVerboseGenerationLoggingEnabled()) {
      this.logger.debug(
        `Generation job ${generationJobId}: saving progress progress=${progress}, step="${data.currentStep}", externalJobId=${data.externalJobId ?? 'none'}`,
      );
    }

    await this.prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        progress,
        currentStep: data.currentStep,
        ...(data.externalJobId ? { externalJobId: data.externalJobId } : {}),
      },
    });
  }

  private buildAiCustomerId(generationJob: {
    userId: string | null;
    guestSessionId: string | null;
    id: string;
  }) {
    const rawId =
      generationJob.userId ?? generationJob.guestSessionId ?? generationJob.id;

    const prefix = generationJob.userId
      ? 'user'
      : generationJob.guestSessionId
        ? 'guest'
        : 'job';

    return `${prefix}_${rawId}`.replace(/\W/g, '_').slice(0, 100);
  }
}
