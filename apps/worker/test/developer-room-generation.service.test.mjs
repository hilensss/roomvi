import assert from 'node:assert/strict';
import test from 'node:test';
import {
  B2BProjectStatus,
  B2BRoomStatus,
  GenerationJobStatus,
  GenerationOwnerType,
  GenerationProvider,
  GenerationScenario,
  InteriorStyle,
  ProductCategory,
  RoomProjectStatus,
  RoomType,
  StockStatus,
} from '@roomvi/database';

const { DeveloperRoomGenerationService } = await import(
  '../dist/modules/generation-processing/developer-room-generation.service.js'
);

function product() {
  return {
    id: 'product-1',
    supplierId: 'supplier-1',
    externalId: 'external-1',
    title: 'Диван',
    description: null,
    category: ProductCategory.SOFA,
    price: 75_000,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: ['https://example.com/sofa.jpg'],
    productUrl: 'https://example.com/sofa',
    widthCm: 210,
    heightCm: 85,
    depthCm: 95,
    material: 'fabric',
    color: 'beige',
    styleTags: [InteriorStyle.MODERN],
    roomTypes: [RoomType.LIVING_ROOM],
    isActive: true,
    isAiEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

test('developer room generation furnishes one deterministic shell without an AI shell pass', async () => {
  const selectedProduct = product();
  const providerInputs = [];
  const createdVariants = [];
  const roomUpdates = [];
  const projectUpdates = [];
  let currentRoomStatus = B2BRoomStatus.GENERATING;
  let curationCompleted = false;
  const b2bProject = {
    id: 'b2b-project-1',
    status: B2BProjectStatus.GENERATING,
    style: InteriorStyle.MODERN,
    defaultCeilingHeightCm: 270,
  };
  const b2bRoom = {
    id: 'b2b-room-1',
    b2bProjectId: b2bProject.id,
    status: B2BRoomStatus.GENERATING,
    name: 'Гостиная',
    roomType: RoomType.LIVING_ROOM,
    styleOverride: null,
    widthCm: 400,
    depthCm: 350,
    ceilingHeightCm: null,
    polygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ],
    shellFileId: null,
    shellGeometryFingerprint: null,
    openings: [
      {
        kind: 'WINDOW',
        wallSegmentIndex: 2,
        positionRatio: 0.5,
        widthCm: 140,
      },
    ],
    b2bProject,
  };
  const roomProject = {
    id: 'room-project-1',
    ownerType: GenerationOwnerType.USER,
    userId: 'manager-1',
    guestSessionId: null,
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MODERN,
    title: 'Квартира · Гостиная',
    widthCm: 400,
    heightCm: 270,
    depthCm: 350,
    status: RoomProjectStatus.READY_TO_GENERATE,
  };
  const generationJob = {
    id: 'job-1',
    ownerType: GenerationOwnerType.USER,
    userId: 'manager-1',
    guestSessionId: null,
    provider: GenerationProvider.MOCK,
    status: GenerationJobStatus.PENDING,
    scenario: GenerationScenario.B2B_DEVELOPER_ROOM,
    requestedVariants: 1,
    roomProjectId: roomProject.id,
    b2bRoomId: b2bRoom.id,
    roomProject,
    b2bRoom,
  };
  const prisma = {
    generationJob: {
      findUnique: async () => generationJob,
      update: async ({ data }) => ({ ...generationJob, ...data }),
    },
    roomProject: {
      update: async ({ data }) => ({ ...roomProject, ...data }),
    },
    b2BRoom: {
      update: async ({ data }) => {
        roomUpdates.push(data);
        if (data.status) currentRoomStatus = data.status;
        return { ...b2bRoom, ...data };
      },
      findMany: async () => [{ status: currentRoomStatus }],
    },
    b2BProject: {
      update: async ({ data }) => {
        projectUpdates.push(data);
        return { ...b2bProject, ...data };
      },
    },
    designVariant: {
      create: async ({ data }) => {
        createdVariants.push(data);
        return { id: 'variant-1', ...data, products: [] };
      },
    },
  };
  const promptBuilder = {
    buildDeveloperPromptWithinLimit: () => ({
      prompt: 'furnish prompt',
      mode: 'full',
      includedProductsCount: 1,
      totalProductsCount: 1,
    }),
    buildNegativePrompt: () => 'negative prompt',
  };
  const aiProviderFactory = {
    getProvider: () => ({
      providerName: 'MOCK',
      generateDesigns: async (input) => {
        assert.equal(curationCompleted, true);
        providerInputs.push(input);
        return [
          {
            title: 'Гостиная',
            imageUrl: 'https://cdn.example.com/final.png',
            productIds: [selectedProduct.id],
          },
        ];
      },
    }),
  };
  const productCurationService = {
    getDeveloperRoomPlan: async () => {
      curationCompleted = true;
      return {
      products: [selectedProduct],
      totalPrice: selectedProduct.price,
      missingRequiredCategories: [],
        spatialProfile: {
          windowPositions: ['wall:2@0.50/140cm'],
          doorPositions: [],
          circulationConstraints: ['do not block window access'],
          sizeClass: 'MEDIUM',
          source: 'REVIEWED_POLYGON',
        },
        scenePlan: {
          roomKey: b2bRoom.id,
          variantIndex: 1,
          direction: 'Balanced living room',
          selectedProductIds: [selectedProduct.id],
          density: 'balanced',
          functionalZones: ['seating'],
          placementHints: [],
        },
      };
    },
  };
  const shellRenderer = {
    prepareShell: async () => ({
      url: 'https://cdn.example.com/deterministic-shell.png',
      key: 'b2b-room-shell/v1/fingerprint.png',
      fingerprint: 'geometry-v1',
      cache: 'MISS',
      durationMs: 4,
      warnings: [],
      model: {
        polygonPoints: 4,
        doorCount: 0,
        windowCount: 1,
        normalizedOpenings: 1,
        camera: 'candidate=1,fov=58',
      },
    }),
  };
  const service = new DeveloperRoomGenerationService(
    prisma,
    promptBuilder,
    aiProviderFactory,
    shellRenderer,
    productCurationService,
  );

  await service.processGenerationJob(generationJob.id);

  assert.equal(providerInputs.length, 1);
  assert.equal(
    providerInputs[0].sourceImageUrl,
    'https://cdn.example.com/deterministic-shell.png',
  );
  assert.equal(providerInputs[0].sourceShell, true);
  assert.equal(providerInputs[0].b2bRoomId, b2bRoom.id);
  assert.deepEqual(
    providerInputs[0].products.map(({ id }) => id),
    ['product-1'],
  );
  assert.equal(createdVariants.length, 1);
  assert.deepEqual(
    createdVariants[0].products.create.map(({ productId }) => productId),
    ['product-1'],
  );
  assert.equal(roomUpdates.at(-1).status, B2BRoomStatus.GENERATED);
  assert.equal(
    projectUpdates.at(-1).status,
    B2BProjectStatus.COMPLETED,
  );
});

test('one failed developer room keeps successful rooms and produces partial completion', async () => {
  const projectUpdates = [];
  const service = new DeveloperRoomGenerationService(
    {
      b2BRoom: {
        findMany: async () => [
          { status: B2BRoomStatus.GENERATED, generationJobs: [] },
          { status: B2BRoomStatus.FAILED, generationJobs: [] },
        ],
      },
      b2BProject: {
        update: async ({ data }) => {
          projectUpdates.push(data);
          return data;
        },
      },
    },
    null,
    null,
    null,
    null,
  );

  await service.aggregateProjectStatus('b2b-project-1');

  assert.equal(projectUpdates.at(-1).status, B2BProjectStatus.PARTIALLY_COMPLETED);
});
