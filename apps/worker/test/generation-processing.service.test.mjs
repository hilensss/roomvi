import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GenerationJobStatus,
  GenerationOwnerType,
  GenerationProvider,
  InteriorStyle,
  ProductCategory,
  RoomProjectStatus,
  RoomType,
  StockStatus,
} from '@roomvi/database';

process.env.GENERATION_VARIANT_RETRY_BASE_DELAY_MS = '0';

const { GenerationProcessingService } = await import(
  '../dist/modules/generation-processing/generation-processing.service.js'
);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function createProduct(variantNumber) {
  return {
    id: `product-${variantNumber}`,
    supplierId: 'supplier-1',
    externalId: `external-${variantNumber}`,
    title: `Sofa ${variantNumber}`,
    description: null,
    category: ProductCategory.SOFA,
    price: 10_000 + variantNumber,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: [`https://example.com/${variantNumber}.jpg`],
    productUrl: `https://example.com/products/${variantNumber}`,
    widthCm: 200,
    heightCm: 80,
    depthCm: 90,
    material: 'fabric',
    color: 'gray',
    styleTags: [InteriorStyle.SCANDI],
    roomTypes: [RoomType.LIVING_ROOM],
    isActive: true,
    isAiEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createHarness(generateDesigns, options = {}) {
  const project = {
    id: 'project-1',
    ownerType: GenerationOwnerType.USER,
    userId: 'user-1',
    guestSessionId: null,
    title: 'Living room',
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.SCANDI,
    budgetMin: null,
    budgetMax: 200_000,
    widthCm: 400,
    heightCm: 270,
    depthCm: 350,
    sourceImageUrl: null,
    status: RoomProjectStatus.READY_TO_GENERATE,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const generationJob = {
    id: 'job-1',
    roomProjectId: project.id,
    ownerType: GenerationOwnerType.USER,
    userId: 'user-1',
    guestSessionId: null,
    provider: GenerationProvider.MOCK,
    status: GenerationJobStatus.PENDING,
    roomProject: project,
  };
  const jobUpdates = [];
  const createdVariants = [];
  const prisma = {
    generationJob: {
      findUnique: async () => generationJob,
      update: async ({ data }) => {
        await options.beforeJobUpdate?.(data);
        jobUpdates.push(data);
        return { ...generationJob, ...data };
      },
    },
    roomProject: {
      update: async ({ data }) => ({ ...project, ...data }),
    },
    designVariant: {
      create: async ({ data }) => {
        createdVariants.push(data);
        return {
          id: `design-${createdVariants.length}`,
          ...data,
          products: [],
        };
      },
    },
  };
  const promptBuilder = {
    buildPrompt: (_project, products) => `prompt:${products[0].id}`,
    buildPromptWithinLimit: (_project, products) => ({
      prompt: `prompt:${products[0].id}`,
      mode: 'full',
      includedProductsCount: products.length,
      totalProductsCount: products.length,
    }),
    buildNegativePrompt: () => 'negative prompt',
  };
  const aiProviderFactory = {
    getProvider: () => ({ providerName: 'MOCK', generateDesigns }),
  };
  const productMatchingService = {
    buildProductSetForVariant: async ({ variantNumber }) => {
      const product = createProduct(variantNumber);
      return {
        products: [product],
        totalPrice: product.price,
        missingRequiredCategories: [],
      };
    },
  };
  const service = new GenerationProcessingService(
    prisma,
    promptBuilder,
    aiProviderFactory,
    productMatchingService,
  );

  return { service, jobUpdates, createdVariants };
}

function getVariantNumber(input) {
  return Number(input.customerId.match(/variant_(\d+)$/)?.[1]);
}

function createGeneratedVariant(input, variantNumber) {
  return {
    title: `Variant ${variantNumber}`,
    imageUrl: `https://example.com/generated-${variantNumber}.jpg`,
    productIds: input.products.map((product) => product.id),
  };
}

test('runs two variants concurrently and preserves variant order', async () => {
  let activeCalls = 0;
  let maximumActiveCalls = 0;
  const starts = [];
  const delays = new Map([
    [1, 40],
    [2, 10],
    [3, 10],
    [4, 10],
  ]);

  const { service, createdVariants } = createHarness(async (input) => {
    const variantNumber = getVariantNumber(input);
    starts.push(variantNumber);
    activeCalls += 1;
    maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
    await sleep(delays.get(variantNumber));
    activeCalls -= 1;
    return [createGeneratedVariant(input, variantNumber)];
  });

  await service.processGenerationJob('job-1');

  assert.equal(maximumActiveCalls, 2);
  assert.deepEqual(starts.slice(0, 3), [1, 2, 3]);
  assert.deepEqual(
    createdVariants.map((variant) => variant.title),
    ['Variant 1', 'Variant 2', 'Variant 3', 'Variant 4'],
  );
});

test('retries a failed variant three times without repeating successful variants', async () => {
  const attempts = new Map();
  const { service } = createHarness(async (input) => {
    const variantNumber = getVariantNumber(input);
    const attempt = (attempts.get(variantNumber) ?? 0) + 1;
    attempts.set(variantNumber, attempt);

    if (variantNumber === 1 && attempt < 4) {
      throw new Error('temporary provider failure');
    }

    return [createGeneratedVariant(input, variantNumber)];
  });

  let processingError;

  try {
    await service.processGenerationJob('job-1');
  } catch (error) {
    processingError = error;
  }

  assert.equal(processingError, undefined);
  assert.equal(attempts.get(1), 4);
  assert.deepEqual(
    [2, 3, 4].map((variantNumber) => attempts.get(variantNumber)),
    [1, 1, 1],
  );
});

test('exhausting retries waits for in-flight work before failing the job', async () => {
  const attempts = new Map();
  const starts = [];
  let activeCalls = 0;
  let failedWhileProviderWasActive;

  const { service } = createHarness(
    async (input) => {
      const variantNumber = getVariantNumber(input);
      const attempt = (attempts.get(variantNumber) ?? 0) + 1;
      attempts.set(variantNumber, attempt);
      starts.push(variantNumber);
      activeCalls += 1;

      try {
        if (variantNumber === 1) {
          await sleep(0);
          throw new Error('permanent provider failure');
        }

        await sleep(50);
        return [createGeneratedVariant(input, variantNumber)];
      } finally {
        activeCalls -= 1;
      }
    },
    {
      beforeJobUpdate: async (data) => {
        if (data.status === GenerationJobStatus.FAILED) {
          failedWhileProviderWasActive = activeCalls > 0;
        }
      },
    },
  );

  await assert.rejects(
    service.processGenerationJob('job-1'),
    /permanent provider failure/,
  );

  assert.equal(attempts.get(1), 4);
  assert.equal(starts.includes(3), false);
  assert.equal(failedWhileProviderWasActive, false);
});

test('aggregates concurrent provider progress into stable public steps', async () => {
  const completionDelays = new Map([
    [1, 30],
    [2, 5],
    [3, 20],
    [4, 5],
  ]);
  const providerSteps = [
    'Готовим запрос к YES AI',
    'Создаём AI-задачу для варианта 1',
    'YES AI поставил вариант 1 в очередь',
    'YES AI генерирует вариант 1',
    'Вариант 1 готов',
  ];
  const { service, jobUpdates } = createHarness(async (input) => {
    const variantNumber = getVariantNumber(input);

    for (const [index, currentStep] of providerSteps.entries()) {
      await input.onProgress?.({
        progress: (index + 1) * 20,
        currentStep,
        externalJobId: `external-${variantNumber}`,
      });
    }

    await sleep(completionDelays.get(variantNumber));
    return [createGeneratedVariant(input, variantNumber)];
  });

  await service.processGenerationJob('job-1');

  const persistedSteps = jobUpdates
    .map((update) => update.currentStep)
    .filter((step) => typeof step === 'string');
  const allowedSteps = [
    'Подбираем товары из каталога',
    'Готовим AI-промпты',
    'Генерируем варианты интерьера: готово 0 из 4',
    'Генерируем варианты интерьера: готово 1 из 4',
    'Генерируем варианты интерьера: готово 2 из 4',
    'Генерируем варианты интерьера: готово 3 из 4',
    'Сохраняем варианты дизайна',
    'Связываем дизайн с товарами',
    'Готово',
  ];

  assert.equal(
    persistedSteps.every((step) => allowedSteps.includes(step)),
    true,
    `unexpected public steps: ${persistedSteps.join(' | ')}`,
  );

  const distinctGenerationSteps = persistedSteps
    .filter(
      (step) =>
        step.startsWith('Генерируем варианты интерьера:') ||
        step === 'Сохраняем варианты дизайна',
    )
    .filter((step, index, steps) => step !== steps[index - 1]);

  assert.deepEqual(distinctGenerationSteps, [
    'Генерируем варианты интерьера: готово 0 из 4',
    'Генерируем варианты интерьера: готово 1 из 4',
    'Генерируем варианты интерьера: готово 2 из 4',
    'Генерируем варианты интерьера: готово 3 из 4',
    'Сохраняем варианты дизайна',
  ]);

  const persistedProgress = jobUpdates
    .map((update) => update.progress)
    .filter((progress) => typeof progress === 'number');

  for (let index = 1; index < persistedProgress.length; index += 1) {
    assert.ok(
      persistedProgress[index] >= persistedProgress[index - 1],
      `progress regressed: ${persistedProgress.join(' -> ')}`,
    );
  }
});

test('throttles provider callback bursts before persisting aggregate progress', async () => {
  let providerCallbackCount = 0;
  const { service, jobUpdates } = createHarness(async (input) => {
    const variantNumber = getVariantNumber(input);

    for (let progress = 1; progress <= 20; progress += 1) {
      providerCallbackCount += 1;
      await input.onProgress?.({
        progress,
        currentStep: `YES AI генерирует вариант ${variantNumber}`,
      });
    }

    return [createGeneratedVariant(input, variantNumber)];
  });

  await service.processGenerationJob('job-1');

  const progressWrites = jobUpdates.filter(
    (update) => typeof update.progress === 'number',
  );

  assert.equal(providerCallbackCount, 80);
  assert.ok(
    progressWrites.length <= 12,
    `expected throttled writes, received ${progressWrites.length}`,
  );
});

test('a retry cannot reset progress already reported by its variant', async () => {
  let firstVariantAttempt = 0;
  const { service, jobUpdates } = createHarness(async (input) => {
    const variantNumber = getVariantNumber(input);

    if (variantNumber === 1) {
      firstVariantAttempt += 1;

      await input.onProgress?.({
        progress: firstVariantAttempt === 1 ? 100 : 10,
        currentStep: `attempt ${firstVariantAttempt}`,
      });

      if (firstVariantAttempt === 1) {
        throw new Error('retry after reporting progress');
      }
    }

    return [createGeneratedVariant(input, variantNumber)];
  });

  await service.processGenerationJob('job-1');

  const persistedProgress = jobUpdates
    .map((update) => update.progress)
    .filter((progress) => typeof progress === 'number');

  for (let index = 1; index < persistedProgress.length; index += 1) {
    assert.ok(
      persistedProgress[index] >= persistedProgress[index - 1],
      `progress regressed: ${persistedProgress.join(' -> ')}`,
    );
  }
});

test('fails the job when the provider produces no variants', async () => {
  const { service, jobUpdates } = createHarness(async () => []);

  await assert.rejects(
    service.processGenerationJob('job-1'),
    /No generated variants were produced/,
  );

  assert.equal(
    jobUpdates.some((update) => update.status === GenerationJobStatus.FAILED),
    true,
  );
});
