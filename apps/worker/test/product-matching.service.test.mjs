import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GenerationScenario,
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@roomvi/database';

const { ProductMatchingService } = await import(
  '../dist/modules/generation-processing/product-matching.service.js'
);

function product(index, category, overrides = {}) {
  return {
    id: `product-${index}`,
    supplierId: 'supplier-1',
    externalId: `external-${index}`,
    title: `${category} ${index}`,
    description: null,
    category,
    price: 10_000 + index,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: [`https://example.com/${index}.jpg`],
    productUrl: `https://example.com/${index}`,
    widthCm: 60,
    heightCm: 100,
    depthCm: 40,
    material: null,
    color: null,
    styleTags: [InteriorStyle.MINIMALISM, InteriorStyle.MODERN],
    roomTypes: [RoomType.HALLWAY, RoomType.BATHROOM, RoomType.OFFICE],
    isActive: true,
    isAiEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function serviceWith(products) {
  return new ProductMatchingService({
    findAiEligibleProducts: async () => products,
  });
}

test('marketplace bedroom validator preserves one selected ceiling pendant', () => {
  const bed = product(920, ProductCategory.BED, {
    roomTypes: [RoomType.BEDROOM],
  });
  const wardrobe = product(921, ProductCategory.WARDROBE, {
    roomTypes: [RoomType.BEDROOM],
  });
  const dresser = product(922, ProductCategory.DRESSER, {
    roomTypes: [RoomType.BEDROOM],
  });
  const rug = product(923, ProductCategory.RUG, {
    roomTypes: [RoomType.BEDROOM],
  });
  const pendant = product(925, ProductCategory.LAMP, {
    title: 'Cottage pendant',
    description: 'Светильник подвесной.',
    roomTypes: [RoomType.BEDROOM],
  });
  const candidates = [bed, wardrobe, dresser, rug, pendant];
  const service = serviceWith(candidates);

  const result = service.validateAndRepairSelection(
    {
      scenario: GenerationScenario.MARKETPLACE,
      roomType: RoomType.BEDROOM,
      style: InteriorStyle.MODERN,
      widthCm: 380,
      depthCm: 340,
      variantNumber: 1,
    },
    candidates,
    candidates.map(({ id }) => id),
  );

  assert.ok(result.productSet);
  assert.equal(
    result.productSet.products.some(({ id }) => id === pendant.id),
    true,
  );
  assert.equal(
    result.repairOperations.includes('removed_fixed_ceiling_lighting'),
    false,
  );
});

test('small marketplace bedroom caps a layered plan at five products', () => {
  const candidates = [
    product(930, ProductCategory.BED, { roomTypes: [RoomType.BEDROOM] }),
    product(931, ProductCategory.WARDROBE, { roomTypes: [RoomType.BEDROOM] }),
    product(932, ProductCategory.DRESSER, { roomTypes: [RoomType.BEDROOM] }),
    product(933, ProductCategory.RUG, { roomTypes: [RoomType.BEDROOM] }),
    product(934, ProductCategory.DECOR, { roomTypes: [RoomType.BEDROOM] }),
    product(935, ProductCategory.LAMP, {
      title: 'Настольная лампа',
      roomTypes: [RoomType.BEDROOM],
    }),
    product(936, ProductCategory.LAMP, {
      title: 'Торшер',
      roomTypes: [RoomType.BEDROOM],
    }),
  ];
  const service = serviceWith(candidates);

  const result = service.validateAndRepairSelection(
    {
      scenario: GenerationScenario.MARKETPLACE,
      roomType: RoomType.BEDROOM,
      style: InteriorStyle.MODERN,
      areaM2: 8,
      density: 'layered',
      variantNumber: 1,
    },
    candidates,
    candidates.map(({ id }) => id),
  );

  assert.ok(result.productSet);
  assert.equal(result.productSet.products.length, 5);
  assert.equal(
    result.productSet.products.some(
      ({ category }) => category === ProductCategory.BED,
    ),
    true,
  );
});

test('marketplace bedroom matcher stops at a coherent five-item core set', async () => {
  const service = serviceWith(roomProducts(RoomType.BEDROOM));

  const result = await service.buildProductSetForVariant({
    scenario: GenerationScenario.MARKETPLACE,
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    areaM2: 20,
    variantNumber: 1,
  });

  assert.equal(result.products.length, 5);
  assert.equal(result.products[0].category, ProductCategory.BED);
  assert.ok(result.products.some(({ category }) => category === ProductCategory.WARDROBE));
  assert.equal(
    result.products.some(({ category }) => category === ProductCategory.ARMCHAIR),
    false,
  );
  assert.equal(
    result.products.some(({ category }) => category === ProductCategory.DECOR),
    false,
  );
});

test('compact hallway selects at most two distinct categories and one wardrobe', async () => {
  const service = serviceWith([
    product(1, ProductCategory.WARDROBE),
    product(2, ProductCategory.WARDROBE),
    product(3, ProductCategory.WARDROBE),
    product(4, 'MIRROR'),
    product(5, 'BENCH'),
  ]);

  const result = await service.buildProductSetForVariant({
    roomType: RoomType.HALLWAY,
    style: InteriorStyle.MINIMALISM,
    widthCm: 120,
    depthCm: 160,
    variantNumber: 1,
  });

  assert.ok(result.products.length <= 2);
  assert.equal(
    new Set(result.products.map(({ category }) => category)).size,
    result.products.length,
  );
  assert.ok(
    result.products.filter(({ category }) => category === 'WARDROBE').length <=
      1,
  );
});

test('bathroom selection never falls back to unrelated furniture', async () => {
  const service = serviceWith([
    product(1, ProductCategory.SOFA),
    product(2, 'MIRROR'),
    product(3, ProductCategory.DECOR),
  ]);

  const result = await service.buildProductSetForVariant({
    roomType: RoomType.BATHROOM,
    style: InteriorStyle.MINIMALISM,
    widthCm: 200,
    depthCm: 200,
    variantNumber: 1,
  });

  assert.ok(result.products.length > 0);
  assert.ok(
    result.products.every(({ category }) =>
      ['MIRROR', ProductCategory.DECOR].includes(category),
    ),
  );
});

test('known oversized products are excluded from matching', async () => {
  const oversizedDesk = product(1, ProductCategory.DESK, {
    widthCm: 500,
    depthCm: 100,
    roomTypes: [RoomType.OFFICE],
  });
  const chair = product(2, ProductCategory.CHAIR, {
    roomTypes: [RoomType.OFFICE],
  });
  const service = serviceWith([oversizedDesk, chair]);

  const result = await service.buildProductSetForVariant({
    roomType: RoomType.OFFICE,
    style: InteriorStyle.MINIMALISM,
    widthCm: 200,
    depthCm: 200,
    variantNumber: 1,
  });

  assert.equal(
    result.products.some(({ id }) => id === oversizedDesk.id),
    false,
  );
});

function roomProducts(roomType) {
  const categories =
    roomType === RoomType.BEDROOM
      ? [
          ProductCategory.BED,
          ProductCategory.WARDROBE,
          ProductCategory.DRESSER,
          ProductCategory.LAMP,
          ProductCategory.RUG,
          ProductCategory.DECOR,
          ProductCategory.ARMCHAIR,
        ]
      : [
          ProductCategory.SOFA,
          ProductCategory.COFFEE_TABLE,
          ProductCategory.TV_STAND,
          ProductCategory.SHELF,
          ProductCategory.RUG,
          ProductCategory.LAMP,
          ProductCategory.ARMCHAIR,
          ProductCategory.DRESSER,
          ProductCategory.DECOR,
        ];

  return categories.map((category, index) =>
    product(index + 20, category, { roomTypes: [roomType] }),
  );
}

test('small bedroom does not select an armchair', async () => {
  const service = serviceWith(roomProducts(RoomType.BEDROOM));
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    widthCm: 300,
    depthCm: 400,
    variantNumber: 1,
  });

  assert.equal(
    result.products.some(({ category }) => category === ProductCategory.ARMCHAIR),
    false,
  );
});

test('bedroom without dimensions does not select an armchair', async () => {
  const service = serviceWith(roomProducts(RoomType.BEDROOM));
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    variantNumber: 1,
  });

  assert.equal(
    result.products.some(({ category }) => category === ProductCategory.ARMCHAIR),
    false,
  );
});

test('large bedroom selects at most one armchair after bed and core products', async () => {
  const service = serviceWith(roomProducts(RoomType.BEDROOM));
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    widthCm: 450,
    depthCm: 400,
    variantNumber: 1,
  });
  const categories = result.products.map(({ category }) => category);
  const armchairIndex = categories.indexOf(ProductCategory.ARMCHAIR);

  assert.ok(armchairIndex >= 4);
  assert.equal(categories.filter((category) => category === ProductCategory.ARMCHAIR).length, 1);
  assert.equal(categories[0], ProductCategory.BED);
  assert.ok(categories.includes(ProductCategory.WARDROBE));
  assert.ok(categories.includes(ProductCategory.LAMP));
});

test('small living room does not select an armchair', async () => {
  const service = serviceWith(roomProducts(RoomType.LIVING_ROOM));
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MINIMALISM,
    widthCm: 350,
    depthCm: 400,
    variantNumber: 1,
  });

  assert.equal(
    result.products.some(({ category }) => category === ProductCategory.ARMCHAIR),
    false,
  );
});

test('large living room selects core categories before at most one armchair', async () => {
  const service = serviceWith(roomProducts(RoomType.LIVING_ROOM));
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MINIMALISM,
    widthCm: 500,
    depthCm: 400,
    variantNumber: 1,
  });
  const categories = result.products.map(({ category }) => category);
  const armchairIndex = categories.indexOf(ProductCategory.ARMCHAIR);

  assert.ok(armchairIndex >= 5);
  assert.equal(categories.filter((category) => category === ProductCategory.ARMCHAIR).length, 1);
  for (const category of [
    ProductCategory.SOFA,
    ProductCategory.COFFEE_TABLE,
    ProductCategory.TV_STAND,
    ProductCategory.RUG,
    ProductCategory.LAMP,
  ]) {
    assert.ok(categories.includes(category), `missing ${category}`);
  }
});

test('hallway prefers specialized functional anchors and mirror', async () => {
  const service = serviceWith([
    product(30, ProductCategory.DECOR),
    product(31, ProductCategory.SHOE_CABINET),
    product(32, ProductCategory.HANGER),
    product(33, ProductCategory.MIRROR),
    product(34, ProductCategory.BENCH),
  ]);
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.HALLWAY,
    style: InteriorStyle.MINIMALISM,
    widthCm: 180,
    depthCm: 300,
    variantNumber: 1,
  });
  const categories = result.products.map(({ category }) => category);

  assert.equal(categories[0], ProductCategory.SHOE_CABINET);
  assert.ok(categories.includes(ProductCategory.HANGER));
  assert.ok(categories.includes(ProductCategory.MIRROR));
});

test('hallway without specialized products uses one functional storage fallback instead of decor fill', async () => {
  const service = serviceWith([
    product(40, ProductCategory.MIRROR),
    product(41, ProductCategory.WARDROBE),
    product(42, ProductCategory.DRESSER),
    product(43, ProductCategory.DECOR),
  ]);
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.HALLWAY,
    style: InteriorStyle.MINIMALISM,
    widthCm: 120,
    depthCm: 250,
    variantNumber: 1,
  });
  const storage = result.products.filter(({ category }) =>
    [ProductCategory.WARDROBE, ProductCategory.DRESSER].includes(category),
  );

  assert.equal(storage.length, 1);
  assert.equal(result.products.some(({ category }) => category === ProductCategory.DECOR), false);
});

test('optional products do not fill a bedroom before core coverage', async () => {
  const bed = product(50, ProductCategory.BED, { roomTypes: [RoomType.BEDROOM] });
  const armchair = product(51, ProductCategory.ARMCHAIR, { roomTypes: [RoomType.BEDROOM] });
  const service = serviceWith([bed, armchair]);
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    areaM2: 20,
    variantNumber: 1,
  });

  assert.deepEqual(result.products.map(({ id }) => id), [bed.id]);
});

test('required anchor may repeat when the excluded catalog has no alternative', async () => {
  const bed = product(60, ProductCategory.BED, { roomTypes: [RoomType.BEDROOM] });
  const service = serviceWith([bed]);
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    variantNumber: 2,
    excludeProductIds: [bed.id],
  });

  assert.deepEqual(result.products.map(({ id }) => id), [bed.id]);
});

test('optional product does not repeat when excluded and no unique alternative exists', async () => {
  const products = roomProducts(RoomType.BEDROOM);
  const service = serviceWith(products);
  const first = await service.buildProductSetForVariant({
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    areaM2: 20,
    variantNumber: 1,
  });
  const second = await service.buildProductSetForVariant({
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    areaM2: 20,
    variantNumber: 2,
    excludeProductIds: first.products.map(({ id }) => id),
  });

  assert.equal(
    second.products.some(({ category }) => category === ProductCategory.ARMCHAIR),
    false,
  );
  assert.equal(second.products[0].category, ProductCategory.BED);
});

test('diversity never selects a wrong-room category or exceeds the budget', async () => {
  const sofa = product(70, ProductCategory.SOFA, {
    price: 40_000,
    roomTypes: [RoomType.LIVING_ROOM],
  });
  const bed = product(71, ProductCategory.BED, {
    price: 1_000,
    roomTypes: [RoomType.BEDROOM],
  });
  const service = serviceWith([sofa, bed]);
  const result = await service.buildProductSetForVariant({
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MINIMALISM,
    budgetMax: 50_000,
    variantNumber: 2,
    excludeProductIds: [sofa.id],
  });

  assert.deepEqual(result.products.map(({ category }) => category), [ProductCategory.SOFA]);
  assert.ok(result.totalPrice <= 50_000);
});

test('marketplace bedroom and living room required anchors remain selected', async () => {
  const bedroom = await serviceWith(roomProducts(RoomType.BEDROOM)).buildProductSetForVariant({
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MINIMALISM,
    variantNumber: 1,
  });
  const livingRoom = await serviceWith(roomProducts(RoomType.LIVING_ROOM)).buildProductSetForVariant({
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MINIMALISM,
    variantNumber: 1,
  });

  assert.equal(bedroom.products[0].category, ProductCategory.BED);
  assert.equal(livingRoom.products[0].category, ProductCategory.SOFA);
});

test('candidate pool is category-balanced, bounded and forwards supplier scope', async () => {
  const catalogCalls = [];
  const products = [
    ...Array.from({ length: 12 }, (_, index) =>
      product(400 + index, ProductCategory.SOFA, {
        roomTypes: [RoomType.LIVING_ROOM],
      }),
    ),
    product(420, ProductCategory.COFFEE_TABLE, {
      roomTypes: [RoomType.LIVING_ROOM],
    }),
    product(421, ProductCategory.TV_STAND, {
      roomTypes: [RoomType.LIVING_ROOM],
    }),
    product(422, ProductCategory.RUG, {
      roomTypes: [RoomType.LIVING_ROOM],
    }),
    product(423, ProductCategory.LAMP, {
      roomTypes: [RoomType.LIVING_ROOM],
    }),
  ];
  const service = new ProductMatchingService({
    findAiEligibleProducts: async (input) => {
      catalogCalls.push(input);
      return products;
    },
  });

  const result = await service.buildCandidatePool({
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MODERN,
    supplierId: 'supplier-1',
    variantNumber: 1,
    candidateLimit: 10,
  });

  assert.equal(result.products.length, 10);
  assert.ok(result.categoryCount >= 5);
  assert.equal(catalogCalls[0].supplierId, 'supplier-1');
});

test('selection validator removes invalid IDs and restores required core coverage', () => {
  const products = [
    product(500, ProductCategory.SOFA, { roomTypes: [RoomType.LIVING_ROOM] }),
    product(501, ProductCategory.COFFEE_TABLE, { roomTypes: [RoomType.LIVING_ROOM] }),
    product(502, ProductCategory.TV_STAND, { roomTypes: [RoomType.LIVING_ROOM] }),
    product(503, ProductCategory.RUG, { roomTypes: [RoomType.LIVING_ROOM] }),
    product(504, ProductCategory.LAMP, { roomTypes: [RoomType.LIVING_ROOM] }),
  ];
  const service = serviceWith(products);

  const result = service.validateAndRepairSelection(
    {
      roomType: RoomType.LIVING_ROOM,
      style: InteriorStyle.MODERN,
      variantNumber: 1,
    },
    products,
    ['unknown', products[0].id, products[0].id],
  );

  assert.equal(result.invalidIds, 1);
  assert.ok(result.repairOperations.includes('removed_duplicate'));
  assert.ok(result.productSet);
  assert.equal(result.productSet.products[0].category, ProductCategory.SOFA);
  assert.ok(result.productSet.products.length >= 5);
});

test('role availability and retrieval group candidates by deterministic scene role', async () => {
  const catalogCalls = [];
  const products = [
    product(600, ProductCategory.BED, { roomTypes: [RoomType.BEDROOM] }),
    product(601, ProductCategory.WARDROBE, { roomTypes: [RoomType.BEDROOM] }),
    product(602, ProductCategory.DRESSER, { roomTypes: [RoomType.BEDROOM] }),
    product(603, ProductCategory.RUG, { roomTypes: [RoomType.BEDROOM] }),
    ...Array.from({ length: 6 }, (_, index) =>
      product(610 + index, ProductCategory.LAMP, {
        title: `Настольная лампа ${index}`,
        roomTypes: [RoomType.BEDROOM],
      }),
    ),
  ];
  const service = new ProductMatchingService({
    findAiEligibleProducts: async (input) => {
      catalogCalls.push(input);
      return products;
    },
  });
  const params = {
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MODERN,
    supplierId: 'supplier-1',
    variantNumber: 1,
  };

  const availability = await service.buildSceneRoleAvailability(params);
  const groups = await service.buildRoleCandidateGroups(
    params,
    {
      roomKey: 'bedroom-1',
      variantIndex: 1,
      designDirection: 'balanced bedroom',
      density: 'BALANCED',
      zones: [{ name: 'sleep', purpose: 'sleeping composition' }],
      requiredRoles: ['PRIMARY_ANCHOR'],
      optionalRoles: ['STORAGE', 'BEDSIDE', 'TASK_LIGHTING', 'TEXTILE'],
      placementRules: [],
      circulationRules: [],
    },
  );

  assert.equal(availability.PRIMARY_ANCHOR, 1);
  assert.equal(availability.STORAGE, 2);
  assert.equal(availability.BEDSIDE, 1);
  assert.equal(availability.TASK_LIGHTING, 6);
  assert.deepEqual(
    groups.map(({ role }) => role),
    ['PRIMARY_ANCHOR', 'STORAGE', 'BEDSIDE', 'TASK_LIGHTING', 'TEXTILE'],
  );
  assert.ok(groups.every(({ products: candidates }) => candidates.length <= 5));
  assert.equal(catalogCalls[0].supplierId, 'supplier-1');
});

test('deterministic role matcher fulfills blueprint without selecting a pendant as task lighting', async () => {
  const candidates = [
    product(700, ProductCategory.BED, { roomTypes: [RoomType.BEDROOM] }),
    product(701, ProductCategory.WARDROBE, { roomTypes: [RoomType.BEDROOM] }),
    product(702, ProductCategory.DRESSER, { roomTypes: [RoomType.BEDROOM] }),
    product(703, ProductCategory.RUG, { roomTypes: [RoomType.BEDROOM] }),
    product(704, ProductCategory.LAMP, {
      title: 'Подвесной светильник Orbit',
      roomTypes: [RoomType.BEDROOM],
    }),
    product(705, ProductCategory.LAMP, {
      title: 'Настольная лампа Nora',
      roomTypes: [RoomType.BEDROOM],
    }),
  ];
  const service = serviceWith(candidates);
  const blueprint = {
    roomKey: 'bedroom-1',
    variantIndex: 1,
    designDirection: 'balanced bedroom',
    density: 'BALANCED',
    zones: [{ name: 'sleep', purpose: 'sleeping composition' }],
    requiredRoles: ['PRIMARY_ANCHOR'],
    optionalRoles: ['STORAGE', 'BEDSIDE', 'TASK_LIGHTING', 'TEXTILE'],
    placementRules: [],
    circulationRules: [],
  };
  const params = {
    scenario: GenerationScenario.MARKETPLACE,
    roomType: RoomType.BEDROOM,
    style: InteriorStyle.MODERN,
    variantNumber: 1,
  };
  const groups = await service.buildRoleCandidateGroups(params, blueprint);
  const result = service.buildDeterministicRoleSelection(
    params,
    blueprint,
    groups,
  );

  assert.ok(result.productSet);
  assert.ok(
    result.roleAssignments.some(
      ({ role, productId }) =>
        role === 'PRIMARY_ANCHOR' && productId === 'product-700',
    ),
  );
  assert.ok(
    result.roleAssignments.some(
      ({ role, productId }) =>
        role === 'TASK_LIGHTING' && productId === 'product-705',
    ),
  );
  assert.equal(
    result.productSet.products.some(({ id }) => id === 'product-704'),
    false,
  );
});

test('role-aware validation removes unknown IDs, duplicate products and budget overflow', async () => {
  const candidates = [
    product(800, ProductCategory.SOFA, {
      price: 50_000,
      roomTypes: [RoomType.LIVING_ROOM],
    }),
    product(801, ProductCategory.COFFEE_TABLE, {
      price: 20_000,
      roomTypes: [RoomType.LIVING_ROOM],
    }),
    product(802, ProductCategory.RUG, {
      price: 20_000,
      roomTypes: [RoomType.LIVING_ROOM],
    }),
  ];
  const service = serviceWith(candidates);
  const blueprint = {
    roomKey: 'living-1',
    variantIndex: 1,
    designDirection: 'practical living room',
    density: 'BALANCED',
    zones: [{ name: 'social', purpose: 'conversation composition' }],
    requiredRoles: ['PRIMARY_ANCHOR'],
    optionalRoles: ['SURFACE', 'TEXTILE'],
    placementRules: [],
    circulationRules: [],
  };
  const params = {
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MODERN,
    budgetMax: 70_000,
    variantNumber: 1,
  };
  const groups = await service.buildRoleCandidateGroups(params, blueprint);
  const result = service.validateAndRepairRoleSelection(
    params,
    blueprint,
    groups,
    {
      roomKey: 'living-1',
      variantIndex: 1,
      selectedProductIds: [
        'unknown',
        'product-800',
        'product-800',
        'product-801',
        'product-802',
      ],
      roleAssignments: [
        { role: 'PRIMARY_ANCHOR', productId: 'product-800' },
        { role: 'SURFACE', productId: 'product-801' },
        { role: 'TEXTILE', productId: 'product-802' },
      ],
      placementHints: [],
    },
  );

  assert.ok(result.productSet);
  assert.deepEqual(
    result.productSet.products.map(({ id }) => id),
    ['product-800', 'product-801'],
  );
  assert.equal(result.productSet.totalPrice, 70_000);
  assert.ok(result.repairOperations.includes('removed_unknown_product'));
  assert.ok(result.repairOperations.includes('removed_duplicate_product'));
  assert.ok(result.repairOperations.includes('trimmed_budget'));
});
