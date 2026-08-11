import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@roomvi/database';

const { ProductCurationService } = await import(
  '../dist/modules/generation-processing/product-curation.service.js'
);
const { ProductMatchingService } = await import(
  '../dist/modules/generation-processing/product-matching.service.js'
);
const { RoomSpatialProfileService } = await import(
  '../dist/modules/generation-processing/room-spatial-profile.service.js'
);

function product(id, category, overrides = {}) {
  return {
    id,
    supplierId: 'supplier-1',
    externalId: `external-${id}`,
    title: `${category} ${id}`,
    description: null,
    category,
    price: 10_000,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: [`https://example.com/${id}.jpg`],
    productUrl: `https://example.com/${id}`,
    widthCm: 120,
    heightCm: 100,
    depthCm: 60,
    material: 'wood',
    color: 'beige',
    styleTags: [InteriorStyle.MODERN],
    roomTypes: [RoomType.BEDROOM],
    isActive: true,
    isAiEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const products = [
  ...Array.from({ length: 4 }, (_, index) =>
    product(`bed-${index + 1}`, ProductCategory.BED),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    product(`wardrobe-${index + 1}`, ProductCategory.WARDROBE),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    product(`dresser-${index + 1}`, ProductCategory.DRESSER),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    product(`rug-${index + 1}`, ProductCategory.RUG),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    product(`lamp-${index + 1}`, ProductCategory.LAMP, {
      title: `Настольная лампа ${index + 1}`,
    }),
  ),
  ...Array.from({ length: 4 }, (_, index) =>
    product(`decor-${index + 1}`, ProductCategory.DECOR),
  ),
];

function blueprint(variantIndex) {
  const densities = ['AIRY', 'BALANCED', 'LAYERED', 'BALANCED'];
  return {
    roomKey: 'bedroom-project',
    variantIndex,
    designDirection: `bedroom concept ${variantIndex}`,
    density: densities[variantIndex - 1],
    zones: [
      {
        name: variantIndex === 3 ? 'layered sleep' : `sleep ${variantIndex}`,
        purpose: `sleeping composition ${variantIndex}`,
      },
    ],
    requiredRoles: ['PRIMARY_ANCHOR'],
    optionalRoles:
      variantIndex === 1
        ? ['STORAGE', 'TEXTILE']
        : variantIndex === 2
          ? ['STORAGE', 'BEDSIDE', 'TASK_LIGHTING']
          : variantIndex === 3
            ? ['STORAGE', 'BEDSIDE', 'TEXTILE', 'TASK_LIGHTING', 'DECOR']
            : ['STORAGE', 'TEXTILE', 'DECOR'],
    placementRules: [
      {
        role: 'PRIMARY_ANCHOR',
        intent: `use solid wall composition ${variantIndex}`,
      },
    ],
    circulationRules: ['keep door-to-window path clear'],
  };
}

function skuPlan(variantIndex) {
  const selected = [
    [`bed-${variantIndex}`, 'PRIMARY_ANCHOR'],
    [`wardrobe-${variantIndex}`, 'STORAGE'],
    ...(variantIndex === 2 || variantIndex === 3
      ? [[`dresser-${variantIndex}`, 'BEDSIDE']]
      : []),
    ...(variantIndex !== 2 ? [[`rug-${variantIndex}`, 'TEXTILE']] : []),
    ...(variantIndex === 2 || variantIndex === 3
      ? [[`lamp-${variantIndex}`, 'TASK_LIGHTING']]
      : []),
    ...(variantIndex >= 3 ? [[`decor-${variantIndex}`, 'DECOR']] : []),
  ];
  return {
    roomKey: 'bedroom-project',
    variantIndex,
    selectedProductIds: selected.map(([id]) => id),
    roleAssignments: selected.map(([productId, role]) => ({ role, productId })),
    placementHints: [],
  };
}

function config(overrides = {}) {
  const values = {
    PRODUCT_CURATION_AI_ENABLED: 'true',
    PRODUCT_CURATION_AI_MODEL: 'gpt-4.1-mini',
    PRODUCT_CURATION_AI_API_MODE: 'chat_completions',
    PRODUCT_CURATION_AI_TIMEOUT_MS: '30000',
    ...overrides,
  };
  return { get: (key) => values[key] };
}

function createService(generateStructured, logs = []) {
  const matching = new ProductMatchingService({
    findAiEligibleProducts: async () => products,
  });
  const service = new ProductCurationService(
    {},
    config(),
    { generateStructured },
    matching,
    new RoomSpatialProfileService(),
  );
  service.logger = {
    log: (message) => logs.push(message),
    warn: (message) => logs.push(message),
    debug: (message) => logs.push(message),
  };
  return service;
}

const marketplaceInput = {
  roomKey: 'bedroom-project',
  roomType: RoomType.BEDROOM,
  style: InteriorStyle.MODERN,
  widthCm: 420,
  depthCm: 360,
  areaM2: 15.12,
  ceilingHeightCm: 270,
  hasSourceImage: true,
};

test('one B2C generation uses exactly two batched text calls for four scene plans', async () => {
  const requests = [];
  const logs = [];
  const service = createService(async (request) => {
    requests.push(request);
    return request.taskName === 'scene_blueprint_design'
      ? {
          data: { blueprints: [1, 2, 3, 4].map(blueprint) },
          provider: 'openai',
          model: 'gpt-4.1-mini',
        }
      : {
          data: { plans: [1, 2, 3, 4].map(skuPlan) },
          provider: 'openai',
          model: 'gpt-4.1-mini',
        };
  }, logs);

  const plans = await service.curateMarketplace(marketplaceInput, 4);

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(({ taskName }) => taskName),
    ['scene_blueprint_design', 'scene_sku_curation'],
  );
  assert.ok(requests.every(({ attachments }) => attachments.length === 0));
  assert.ok(requests.every(({ maxAttempts }) => maxAttempts === 1));
  assert.ok(requests.every(({ timeoutMs }) => timeoutMs === 30_000));
  assert.ok(requests.every(({ model }) => model === 'gpt-4.1-mini'));
  assert.ok(requests.every(({ apiMode }) => apiMode === 'chat_completions'));
  assert.ok(
    requests.every((request) =>
      !/reasoning|explanation|chainOfThought/i.test(
        JSON.stringify(request.jsonSchema),
      ),
    ),
  );
  assert.equal(requests[0].jsonSchema.properties.blueprints.minItems, 4);
  assert.equal(requests[0].jsonSchema.properties.blueprints.maxItems, 4);
  assert.equal(requests[1].jsonSchema.properties.plans.minItems, 4);
  assert.equal(requests[1].jsonSchema.properties.plans.maxItems, 4);
  assert.doesNotMatch(requests[0].userPrompt, /bed-1|productId|selectedProductIds/i);
  assert.match(requests[0].userPrompt, /roleAvailability/);
  assert.match(requests[1].userPrompt, /bed-1/);
  assert.doesNotMatch(
    requests[1].userPrompt,
    /imageUrls|productUrl|description/i,
  );
  const skuPayload = JSON.parse(requests[1].userPrompt);
  assert.equal(skuPayload.rooms.length, 1);
  assert.equal(skuPayload.blueprints.length, 4);
  assert.equal(
    skuPayload.rooms.flatMap(({ candidateGroups }) =>
      candidateGroups.flatMap(({ products: candidates }) =>
        candidates.map(([id]) => id),
      ),
    ).filter((id) => id === 'bed-1').length,
    1,
  );
  assert.equal(plans.length, 4);
  assert.deepEqual(
    plans.map(({ scenePlan }) => scenePlan.designDirection),
    [1, 2, 3, 4].map((index) => `bedroom concept ${index}`),
  );
  assert.ok(
    plans.every(({ curationMode }) => curationMode.startsWith('AI_CURATED')),
  );
  assert.ok(logs.some((message) => /Scene blueprint completed: mode=AI/.test(message)));
  assert.ok(logs.some((message) => /SKU curation completed: mode=AI/.test(message)));
  assert.ok(
    logs.some(
      (message) =>
        /SKU curation completed: mode=AI/.test(message) &&
        /candidateCount=\d+/.test(message),
    ),
  );
});

test('disabled planner makes no text calls and uses both deterministic phases', async () => {
  let calls = 0;
  const matching = new ProductMatchingService({
    findAiEligibleProducts: async () => products,
  });
  const service = new ProductCurationService(
    {},
    config({ PRODUCT_CURATION_AI_ENABLED: 'false' }),
    {
      generateStructured: async () => {
        calls += 1;
        throw new Error('must not be called');
      },
    },
    matching,
    new RoomSpatialProfileService(),
  );

  const plans = await service.curateMarketplace(marketplaceInput, 4);

  assert.equal(calls, 0);
  assert.equal(plans.length, 4);
  assert.ok(
    plans.every(({ curationMode }) => curationMode === 'DETERMINISTIC_ONLY'),
  );
});

test('phase one failure uses deterministic blueprints and still attempts AI SKU curation', async () => {
  const requests = [];
  const service = createService(async (request) => {
    requests.push(request);
    if (request.taskName === 'scene_blueprint_design') {
      throw new Error('blueprint provider failed');
    }
    const payload = JSON.parse(request.userPrompt);
    return {
      data: {
        plans: payload.blueprints.map((plan) => {
          const primary = payload.rooms
            .find(({ roomKey }) => roomKey === plan.roomKey)
            .candidateGroups.find(({ role }) => role === 'PRIMARY_ANCHOR').products[0];
          return {
            roomKey: plan.roomKey,
            variantIndex: plan.variantIndex,
            selectedProductIds: [primary[0]],
            roleAssignments: [
              { role: 'PRIMARY_ANCHOR', productId: primary[0] },
            ],
            placementHints: [],
          };
        }),
      },
      provider: 'openai',
      model: 'gpt-4.1-mini',
    };
  });

  const plans = await service.curateMarketplace(marketplaceInput, 4);

  assert.equal(requests.length, 2);
  assert.ok(
    plans.every(({ scenePlan }) =>
      scenePlan.designDirection.includes('bedroom'),
    ),
  );
  assert.ok(
    plans.every(({ curationMode }) => curationMode === 'DETERMINISTIC_FALLBACK'),
  );
  assert.ok(plans.every(({ fallbackReason }) => fallbackReason === 'PROVIDER'));
});

test('phase two failure retains successful AI blueprints for deterministic SKU fallback', async () => {
  const requests = [];
  const service = createService(async (request) => {
    requests.push(request);
    if (request.taskName === 'scene_blueprint_design') {
      return {
        data: { blueprints: [1, 2, 3, 4].map(blueprint) },
        provider: 'openai',
        model: 'gpt-4.1-mini',
      };
    }
    throw new Error('sku provider failed');
  });

  const plans = await service.curateMarketplace(marketplaceInput, 4);

  assert.equal(requests.length, 2);
  assert.deepEqual(
    plans.map(({ scenePlan }) => scenePlan.designDirection),
    [1, 2, 3, 4].map((index) => `bedroom concept ${index}`),
  );
  assert.ok(plans.every(({ products: selected }) => selected.length > 0));
  assert.ok(
    plans.every(({ curationMode }) => curationMode === 'DETERMINISTIC_FALLBACK'),
  );
});

test('four identical SKU sets fail diversity validation and use phase-two fallback', async () => {
  const logs = [];
  const repeated = skuPlan(1);
  const service = createService(async (request) =>
    request.taskName === 'scene_blueprint_design'
      ? {
          data: { blueprints: [1, 2, 3, 4].map(blueprint) },
          provider: 'openai',
          model: 'gpt-4.1-mini',
        }
      : {
          data: {
            plans: [1, 2, 3, 4].map((variantIndex) => ({
              ...repeated,
              variantIndex,
            })),
          },
          provider: 'openai',
          model: 'gpt-4.1-mini',
        },
  logs);

  const plans = await service.curateMarketplace(marketplaceInput, 4);

  assert.ok(
    plans.every(({ curationMode }) => curationMode === 'DETERMINISTIC_FALLBACK'),
  );
  assert.ok(
    logs.some(
      (message) =>
        /phase=SKU_CURATION/.test(message) && /VALIDATION/.test(message),
    ),
  );
});

test('concurrent B2B room jobs share exactly two project-wide text calls', async () => {
  const sofa = product('sofa-b2b', ProductCategory.SOFA, {
    roomTypes: [RoomType.LIVING_ROOM],
  });
  const bed = product('bed-b2b', ProductCategory.BED, {
    roomTypes: [RoomType.BEDROOM],
  });
  const rooms = [
    {
      id: 'living-b2b',
      name: 'Гостиная',
      roomType: RoomType.LIVING_ROOM,
      styleOverride: null,
      widthCm: 420,
      depthCm: 360,
      areaM2: 15.12,
      ceilingHeightCm: null,
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      openings: [],
      generationJobs: [{ id: 'job-living', inputParams: null }],
    },
    {
      id: 'bedroom-b2b',
      name: 'Спальня',
      roomType: RoomType.BEDROOM,
      styleOverride: null,
      widthCm: 380,
      depthCm: 340,
      areaM2: 12.92,
      ceilingHeightCm: null,
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      openings: [],
      generationJobs: [{ id: 'job-bedroom', inputParams: null }],
    },
  ];
  const project = {
    id: 'project-b2b',
    name: 'ЖК Test',
    partnerName: 'Developer',
    style: InteriorStyle.MODERN,
    supplierId: null,
    defaultCeilingHeightCm: 270,
    rooms,
  };
  const updates = [];
  const prisma = {
    b2BProject: { findUnique: async () => project },
    generationJob: {
      findUnique: async () => null,
      update: async ({ where, data }) => {
        updates.push({ id: where.id, data });
        return data;
      },
    },
    product: { findMany: async () => [] },
  };
  const requests = [];
  const reasoningAi = {
    generateStructured: async (request) => {
      requests.push(request);
      return request.taskName === 'scene_blueprint_design'
        ? {
            data: {
              blueprints: [
                {
                  roomKey: 'living-b2b',
                  variantIndex: 1,
                  designDirection: 'balanced social room',
                  density: 'BALANCED',
                  zones: [{ name: 'social', purpose: 'conversation zone' }],
                  requiredRoles: ['PRIMARY_ANCHOR'],
                  optionalRoles: [],
                  placementRules: [],
                  circulationRules: [],
                },
                {
                  roomKey: 'bedroom-b2b',
                  variantIndex: 1,
                  designDirection: 'calm sleeping room',
                  density: 'BALANCED',
                  zones: [{ name: 'sleep', purpose: 'sleeping zone' }],
                  requiredRoles: ['PRIMARY_ANCHOR'],
                  optionalRoles: [],
                  placementRules: [],
                  circulationRules: [],
                },
              ],
            },
            provider: 'openai',
            model: 'gpt-4.1-mini',
          }
        : {
            data: {
              plans: [
                {
                  roomKey: 'living-b2b',
                  variantIndex: 1,
                  selectedProductIds: [sofa.id],
                  roleAssignments: [
                    { role: 'PRIMARY_ANCHOR', productId: sofa.id },
                  ],
                  placementHints: [],
                },
                {
                  roomKey: 'bedroom-b2b',
                  variantIndex: 1,
                  selectedProductIds: [bed.id],
                  roleAssignments: [
                    { role: 'PRIMARY_ANCHOR', productId: bed.id },
                  ],
                  placementHints: [],
                },
              ],
            },
            provider: 'openai',
            model: 'gpt-4.1-mini',
          };
    },
  };
  const matching = new ProductMatchingService({
    findAiEligibleProducts: async () => [sofa, bed],
  });
  const service = new ProductCurationService(
    prisma,
    config(),
    reasoningAi,
    matching,
    new RoomSpatialProfileService(),
  );

  const [livingPlan, bedroomPlan] = await Promise.all([
    service.getDeveloperRoomPlan({
      projectId: project.id,
      roomId: 'living-b2b',
      generationJobId: 'job-living',
    }),
    service.getDeveloperRoomPlan({
      projectId: project.id,
      roomId: 'bedroom-b2b',
      generationJobId: 'job-bedroom',
    }),
  ]);

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(({ taskName }) => taskName),
    ['scene_blueprint_design', 'scene_sku_curation'],
  );
  assert.equal(livingPlan.products[0].id, sofa.id);
  assert.equal(bedroomPlan.products[0].id, bed.id);
  assert.deepEqual(updates.map(({ id }) => id).sort(), [
    'job-bedroom',
    'job-living',
  ]);
});
