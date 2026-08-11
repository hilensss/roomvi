import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@roomvi/database';

const { PromptBuilderService } = await import(
  '../dist/modules/generation-processing/prompt-builder.service.js'
);

const dto = {
  roomType: RoomType.LIVING_ROOM,
  style: InteriorStyle.SCANDI,
  title: 'Compact prompt test room',
  budgetMax: 250_000,
  widthCm: 420,
  heightCm: 270,
  depthCm: 360,
};

const longDescriptionTail = 'UNTRUNCATED_DESCRIPTION_END_MARKER';

function createProduct({
  index,
  category,
  title = `${category} catalog product ${index}`,
  description = `Short ${category} description.`,
}) {
  return {
    id: `product-${index}`,
    supplierId: 'supplier-1',
    externalId: `external-${index}`,
    title,
    description,
    category,
    price: 10_000 + index,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: [`https://example.com/${index}.jpg`],
    productUrl: `https://example.com/products/${index}`,
    widthCm: 100 + index,
    heightCm: 80 + index,
    depthCm: 60 + index,
    material: 'oak veneer and textured fabric',
    color: 'warm gray',
    styleTags: [InteriorStyle.SCANDI, InteriorStyle.MODERN],
    roomTypes: [RoomType.LIVING_ROOM, RoomType.STUDIO],
    isActive: true,
    isAiEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createLongDescription(index) {
  return [
    `Product ${index} premium merchandising description.`,
    'Detailed construction notes, supplier style copy, room recommendations, material care instructions, finish variants and visual nuance.',
    'This sentence intentionally repeats to make the full prompt exceed the YES AI limit.',
    'Detailed construction notes, supplier style copy, room recommendations, material care instructions, finish variants and visual nuance.',
    longDescriptionTail,
  ].join(' ');
}

function createNineLivingRoomProducts(overrides = {}) {
  const categories = [
    ProductCategory.SOFA,
    ProductCategory.COFFEE_TABLE,
    ProductCategory.TV_STAND,
    ProductCategory.SHELF,
    ProductCategory.RUG,
    ProductCategory.LAMP,
    ProductCategory.DECOR,
    ProductCategory.ARMCHAIR,
    ProductCategory.CHAIR,
  ];

  return categories.map((category, index) =>
    createProduct({
      index: index + 1,
      category,
      description: createLongDescription(index + 1).repeat(
        overrides.descriptionRepeat ?? 8,
      ),
      title:
        overrides.longTitle && category !== ProductCategory.SOFA
          ? `${category} `.repeat(overrides.longTitle)
          : `${category} compact title ${index + 1}`,
    }),
  );
}

test('safe provider budget compacts a verbose prompt without dropping products', () => {
  const promptBuilder = new PromptBuilderService();
  const products = [
    createProduct({ index: 1, category: ProductCategory.SOFA }),
    createProduct({ index: 2, category: ProductCategory.COFFEE_TABLE }),
  ];

  const fullPrompt = promptBuilder.buildPrompt(dto, products);
  const result = promptBuilder.buildPromptWithinLimit(dto, products, 9500);

  assert.equal(result.mode, fullPrompt.length <= 8000 ? 'full' : 'compact');
  if (result.mode === 'compact') assert.notEqual(result.prompt, fullPrompt);
  assert.equal(result.includedProductsCount, products.length);
  assert.equal(result.totalProductsCount, products.length);
  assert.ok(result.prompt.length <= 9500);
});

test('large descriptions use compact mode without dropping strict prompt sections', () => {
  const promptBuilder = new PromptBuilderService();
  const products = createNineLivingRoomProducts();
  const result = promptBuilder.buildPromptWithinLimit(dto, products, 9500);

  assert.equal(result.mode, 'compact');
  assert.equal(result.includedProductsCount, 9);
  assert.equal(result.totalProductsCount, 9);
  assert.ok(result.prompt.length <= 9500);
  assert.match(result.prompt, /only purchasable furniture/i);
  assert.match(result.prompt, /UNSELECTED MAJOR CATEGORIES ARE FORBIDDEN/);
  assert.match(result.prompt, /Reference product images may be attached/);
  assert.match(result.prompt, /The sofa is the hero object/);
  assert.match(result.prompt, /selected SOFA is the hero object/i);
  assert.match(result.prompt, /\bBED\b/);
  assert.match(result.prompt, /FINAL QUALITY TARGET:/);
  assert.match(result.prompt, /SOFA compact title 1/);
  assert.match(result.prompt, /No labels, prices, logos, annotations or measurement text\.$/);
  assert.equal(result.prompt.includes(longDescriptionTail), false);
});

test('compact mode omits secondary product metadata while keeping all compact fields', () => {
  const promptBuilder = new PromptBuilderService();
  const products = createNineLivingRoomProducts();
  const result = promptBuilder.buildPromptWithinLimit(dto, products, 9500);

  assert.equal(result.mode, 'compact');
  assert.match(result.prompt, /category=SOFA/);
  assert.match(result.prompt, /title=SOFA compact title 1/);
  assert.match(result.prompt, /color=warm gray/);
  assert.match(result.prompt, /material=oak veneer and textured fabric/);
  assert.match(result.prompt, /size=101x81x61cm/);
  assert.doesNotMatch(result.prompt, /Product 1 premium/);
  assert.match(result.prompt, /shape=PRESERVE_REFERENCE_SOFA/);
  assert.match(
    result.prompt,
    /Preserve recognizable silhouette, proportions, construction, dominant color\/material and subtype/,
  );
  assert.equal(result.prompt.includes('ID=product-1'), false);
  assert.equal(result.prompt.includes('PRICE='), false);
  assert.equal(result.prompt.includes('CATALOG_STYLES='), false);
  assert.equal(result.prompt.includes('CATALOG_ROOMS='), false);
});

test('smaller limit keeps every selected product and final rules', () => {
  const promptBuilder = new PromptBuilderService();
  const products = createNineLivingRoomProducts({
    descriptionRepeat: 12,
    longTitle: 30,
  });
  const result = promptBuilder.buildPromptWithinLimit(dto, products, 6200);

  assert.equal(result.mode, 'compact');
  assert.ok(result.prompt.length <= 6200);
  assert.equal(result.includedProductsCount, result.totalProductsCount);
  for (let index = 1; index <= products.length; index += 1) {
    assert.match(result.prompt, new RegExp(`PRODUCT_${index}`));
  }
  assert.match(result.prompt, /category=SOFA/);
  assert.match(result.prompt, /only purchasable furniture/i);
  assert.match(result.prompt, /\bBED\b/);
  assert.match(result.prompt, /No labels, prices, logos, annotations or measurement text\.$/);
});

test('buildPrompt keeps existing full product detail behavior', () => {
  const promptBuilder = new PromptBuilderService();
  const products = createNineLivingRoomProducts();
  const fullPrompt = promptBuilder.buildPrompt(dto, products);

  assert.match(fullPrompt, /ID=product-1/);
  assert.match(fullPrompt, /PRICE=10001 RUB/);
  assert.match(fullPrompt, /CATALOG_STYLES=SCANDI, MODERN/);
  assert.match(fullPrompt, /CATALOG_ROOMS=LIVING_ROOM, STUDIO/);
  assert.match(fullPrompt, new RegExp(longDescriptionTail));
});

test('product prompt requires every selected catalog item exactly once', () => {
  const promptBuilder = new PromptBuilderService();
  const products = [
    createProduct({ index: 1, category: ProductCategory.SOFA }),
    createProduct({ index: 2, category: ProductCategory.COFFEE_TABLE }),
  ];

  const prompt = promptBuilder.buildPrompt(dto, products);

  assert.match(prompt, /every selected product naturally into the composition exactly once/i);
});

test('bedroom prompt remains unmistakably a bedroom', () => {
  const promptBuilder = new PromptBuilderService();
  const bed = createProduct({ index: 20, category: ProductCategory.BED });
  const prompt = promptBuilder.buildPrompt(
    { ...dto, roomType: RoomType.BEDROOM },
    [bed],
  );

  assert.match(prompt, /unmistakably like a bedroom/i);
  assert.match(prompt, /bed is the hero object/i);
  assert.match(prompt, /never use a sofa\/couch as a substitute for a bed/i);
});

test('hallway prompt protects circulation and compact wall-aligned storage', () => {
  const promptBuilder = new PromptBuilderService();
  const prompt = promptBuilder.buildPrompt(
    { ...dto, roomType: RoomType.HALLWAY },
    [createProduct({ index: 21, category: ProductCategory.SHOE_CABINET })],
  );

  assert.match(prompt, /keep a clear path from the entrance to every doorway/i);
  assert.match(prompt, /against real usable wall segments/i);
  assert.match(prompt, /do not widen or extend it/i);
  assert.match(prompt, /do not create a lounge composition/i);
});

test('B2C bathroom prompt does not invent sanitary or unselected commercial furniture', () => {
  const promptBuilder = new PromptBuilderService();
  const prompt = promptBuilder.buildPrompt(
    { ...dto, roomType: RoomType.BATHROOM },
    [createProduct({ index: 22, category: ProductCategory.MIRROR })],
  );

  assert.match(prompt, /Do not invent sanitary or furniture products/i);
  assert.match(prompt, /Do not add freestanding cabinets/i);
});

test('missing armchair remains forbidden explicitly', () => {
  const promptBuilder = new PromptBuilderService();
  const prompt = promptBuilder.buildPrompt(dto, [
    createProduct({ index: 23, category: ProductCategory.SOFA }),
  ]);

  assert.match(prompt, /No ARMCHAIR product is selected/i);
  assert.match(prompt, /do not add armchairs or lounge chairs/i);
});

test('selected armchair stays secondary and space-dependent', () => {
  const promptBuilder = new PromptBuilderService();
  const prompt = promptBuilder.buildPrompt(dto, [
    createProduct({ index: 24, category: ProductCategory.SOFA }),
    createProduct({ index: 25, category: ProductCategory.ARMCHAIR }),
  ]);

  assert.match(prompt, /ARMCHAIR at most once as a secondary seating accent/i);
  assert.match(prompt, /secondary to the sofa and core seating group/i);
  assert.match(prompt, /Do not force it into the scene if that blocks circulation/i);
});

test('scene plan and reviewed geometry become compact placement guidance', () => {
  const promptBuilder = new PromptBuilderService();
  const product = createProduct({ index: 26, category: ProductCategory.SOFA });
  const result = promptBuilder.buildPromptWithinLimit(
    {
      ...dto,
      scenePlan: {
        roomKey: 'room-1',
        variantIndex: 1,
        designDirection: 'Keep the social zone on the long solid wall',
        selectedProductIds: [product.id],
        density: 'BALANCED',
        zones: [
          { name: 'seating', purpose: 'social seating composition' },
          { name: 'circulation', purpose: 'clear room crossing' },
        ],
        requiredRoles: ['PRIMARY_ANCHOR'],
        optionalRoles: [],
        placementRules: [],
        circulationRules: ['preserve elongated room proportions'],
        roleAssignments: [
          { role: 'PRIMARY_ANCHOR', productId: product.id },
        ],
        placementHints: [
          {
            role: 'PRIMARY_ANCHOR',
            productId: product.id,
            category: ProductCategory.SOFA,
            hint: 'place along the long wall opposite the window',
          },
        ],
      },
      spatialProfile: {
        widthCm: 220,
        depthCm: 500,
        areaM2: 11,
        aspectRatio: 2.27,
        windowPositions: ['wall:1@0.50/140cm'],
        doorPositions: ['wall:3@0.20/90cm'],
        longWallCm: 500,
        usableSolidWallCm: 410,
        circulationConstraints: ['preserve elongated room proportions'],
        sizeClass: 'MEDIUM',
        source: 'REVIEWED_POLYGON',
      },
    },
    [product],
    9500,
  );

  assert.match(result.prompt, /SCENE BLUEPRINT/);
  assert.match(result.prompt, /density=BALANCED/);
  assert.match(result.prompt, /usableSolidWall=410cm/);
  assert.match(result.prompt, /preserve elongated room proportions/);
  assert.ok(result.prompt.length <= 9500);
});

test('selected bedroom pendant gets safe ceiling placement guidance', () => {
  const promptBuilder = new PromptBuilderService();
  const pendant = createProduct({
    index: 27,
    category: ProductCategory.LAMP,
    title: 'Подвесной светильник Sphere',
  });
  const prompt = promptBuilder.buildPrompt(
    {
      ...dto,
      roomType: RoomType.BEDROOM,
      scenePlan: {
        roomKey: 'bedroom-1',
        variantIndex: 1,
        designDirection: 'Airy bedroom',
        selectedProductIds: [pendant.id],
        density: 'AIRY',
        zones: [{ name: 'sleeping', purpose: 'calm sleeping composition' }],
        requiredRoles: [],
        optionalRoles: ['AMBIENT_LIGHTING'],
        placementRules: [],
        circulationRules: [],
        roleAssignments: [
          { role: 'AMBIENT_LIGHTING', productId: pendant.id },
        ],
        placementHints: [],
      },
    },
    [pendant],
  );

  assert.match(prompt, /ceiling-mounted secondary fixture/i);
  assert.match(prompt, /do not hang it unrealistically low/i);
  assert.match(prompt, /do not place it directly over the bed/i);
  assert.doesNotMatch(prompt, /selected LAMP as the main visible lighting/i);
});

test('selected table lamp gets tabletop guidance without pendant wording', () => {
  const promptBuilder = new PromptBuilderService();
  const lamp = createProduct({
    index: 28,
    category: ProductCategory.LAMP,
    title: 'Настольная лампа Nora',
  });
  const prompt = promptBuilder.buildPrompt(
    {
      ...dto,
      roomType: RoomType.BEDROOM,
      scenePlan: {
        roomKey: 'bedroom-1',
        variantIndex: 1,
        designDirection: 'Comfort bedroom',
        selectedProductIds: [lamp.id],
        density: 'BALANCED',
        zones: [{ name: 'sleeping', purpose: 'comfortable sleeping composition' }],
        requiredRoles: [],
        optionalRoles: ['TASK_LIGHTING'],
        placementRules: [],
        circulationRules: [],
        roleAssignments: [
          { role: 'TASK_LIGHTING', productId: lamp.id },
        ],
        placementHints: [],
      },
    },
    [lamp],
  );

  assert.match(prompt, /place on a suitable bedside or dresser surface/i);
  assert.doesNotMatch(prompt, /selected pendant|ceiling-mounted secondary fixture/i);
});

test('selected floor lamp gets grounded reading-zone guidance', () => {
  const promptBuilder = new PromptBuilderService();
  const lamp = createProduct({
    index: 29,
    category: ProductCategory.LAMP,
    title: 'Торшер Arc',
  });
  const prompt = promptBuilder.buildPrompt(
    {
      ...dto,
      scenePlan: {
        roomKey: 'living-1',
        variantIndex: 1,
        designDirection: 'Reading corner',
        selectedProductIds: [lamp.id],
        density: 'BALANCED',
        zones: [{ name: 'reading', purpose: 'grounded reading corner' }],
        requiredRoles: [],
        optionalRoles: ['TASK_LIGHTING'],
        placementRules: [],
        circulationRules: [],
        roleAssignments: [
          { role: 'TASK_LIGHTING', productId: lamp.id },
        ],
        placementHints: [],
      },
    },
    [lamp],
  );

  assert.match(prompt, /place on the floor near a reading or seating zone/i);
  assert.match(prompt, /never floating/i);
});

test('selected wall lamp gets wall-mounted guidance', () => {
  const promptBuilder = new PromptBuilderService();
  const lamp = createProduct({
    index: 30,
    category: ProductCategory.LAMP,
    title: 'Бра Mist',
  });
  const prompt = promptBuilder.buildPrompt(
    {
      ...dto,
      scenePlan: {
        roomKey: 'living-1',
        variantIndex: 1,
        designDirection: 'Ambient wall lighting',
        selectedProductIds: [lamp.id],
        density: 'BALANCED',
        zones: [{ name: 'ambient lighting', purpose: 'soft wall illumination' }],
        requiredRoles: [],
        optionalRoles: ['AMBIENT_LIGHTING'],
        placementRules: [],
        circulationRules: [],
        roleAssignments: [
          { role: 'AMBIENT_LIGHTING', productId: lamp.id },
        ],
        placementHints: [],
      },
    },
    [lamp],
  );

  assert.match(prompt, /keep wall-mounted at a realistic height/i);
});

test('new scene plan adds compact blueprint, commercial and scene-dressing sections', () => {
  const promptBuilder = new PromptBuilderService();
  const bed = createProduct({
    index: 31,
    category: ProductCategory.BED,
    title: 'Bed Nova',
  });
  const prompt = promptBuilder.buildPrompt(
    {
      ...dto,
      roomType: RoomType.BEDROOM,
      sourceImageUrl: 'https://example.com/empty-room.jpg',
      scenePlan: {
        roomKey: 'bedroom-new',
        variantIndex: 1,
        designDirection: 'balanced modern bedroom',
        density: 'BALANCED',
        zones: [
          { name: 'sleep', purpose: 'bed centered on the main solid wall' },
          { name: 'storage', purpose: 'storage close to the entrance' },
        ],
        requiredRoles: ['PRIMARY_ANCHOR'],
        optionalRoles: ['STORAGE', 'BEDSIDE', 'TEXTILE'],
        placementRules: [
          {
            role: 'PRIMARY_ANCHOR',
            intent: 'center on the main usable solid wall',
          },
        ],
        circulationRules: ['keep a clear path from door to window'],
        selectedProductIds: [bed.id],
        roleAssignments: [
          { role: 'PRIMARY_ANCHOR', productId: bed.id },
        ],
        placementHints: [],
      },
    },
    [bed],
  );

  assert.match(prompt, /SCENE BLUEPRINT:/);
  assert.match(prompt, /balanced modern bedroom/);
  assert.match(prompt, /Density: BALANCED/);
  assert.match(prompt, /sleep: bed centered on the main solid wall/);
  assert.match(prompt, /COMMERCIAL PRODUCTS:/);
  assert.match(prompt, /SCENE DRESSING:/);
  assert.match(prompt, /bedding|layered textiles/i);
  assert.match(prompt, /curtains/i);
  assert.match(prompt, /small plants/i);
  assert.match(prompt, /Do not add an unselected.*furniture/i);
  assert.doesNotMatch(prompt, /direction=NORTH/);
});

test('scene dressing allows secondary context but forbids unselected major furniture', () => {
  const promptBuilder = new PromptBuilderService();
  const bed = createProduct({ index: 32, category: ProductCategory.BED });
  const prompt = promptBuilder.buildPrompt(
    {
      ...dto,
      roomType: RoomType.BEDROOM,
      scenePlan: {
        roomKey: 'bedroom-dressing',
        variantIndex: 1,
        designDirection: 'airy bedroom',
        density: 'AIRY',
        zones: [{ name: 'sleep', purpose: 'simple sleeping zone' }],
        requiredRoles: ['PRIMARY_ANCHOR'],
        optionalRoles: [],
        placementRules: [],
        circulationRules: [],
        selectedProductIds: [bed.id],
        roleAssignments: [
          { role: 'PRIMARY_ANCHOR', productId: bed.id },
        ],
        placementHints: [],
      },
    },
    [bed],
  );
  const negative = promptBuilder.buildNegativePrompt(
    { ...dto, roomType: RoomType.BEDROOM },
    [bed],
  );

  assert.match(prompt, /pillows|neutral bedding/i);
  assert.match(prompt, /wall finish|baseboards/i);
  assert.match(prompt, /Do not add.*sofa.*wardrobe.*table.*armchair/i);
  assert.doesNotMatch(negative, /plants not in catalog/i);
  assert.doesNotMatch(negative, /curtains not in catalog/i);
});

test('irregular reviewed geometry and openings remain explicit blueprint context', () => {
  const promptBuilder = new PromptBuilderService();
  const sofa = createProduct({ index: 33, category: ProductCategory.SOFA });
  const prompt = promptBuilder.buildPrompt(
    {
      ...dto,
      sourceImageUrl: 'https://example.com/shell.jpg',
      scenePlan: {
        roomKey: 'irregular-room',
        variantIndex: 1,
        designDirection: 'practical social room',
        density: 'BALANCED',
        zones: [{ name: 'social', purpose: 'use the longest solid wall' }],
        requiredRoles: ['PRIMARY_ANCHOR'],
        optionalRoles: [],
        placementRules: [],
        circulationRules: ['preserve the L-shaped circulation path'],
        selectedProductIds: [sofa.id],
        roleAssignments: [
          { role: 'PRIMARY_ANCHOR', productId: sofa.id },
        ],
        placementHints: [],
      },
      spatialProfile: {
        widthCm: 500,
        depthCm: 320,
        areaM2: 13.8,
        aspectRatio: 1.56,
        polygonPoints: 6,
        windowPositions: ['wall:1@0.50/140cm'],
        doorPositions: ['wall:4@0.20/90cm'],
        longWallCm: 500,
        usableSolidWallCm: 410,
        circulationConstraints: ['preserve irregular room proportions'],
        sizeClass: 'MEDIUM',
        source: 'REVIEWED_POLYGON',
      },
    },
    [sofa],
  );

  assert.match(prompt, /source=REVIEWED_POLYGON/);
  assert.match(prompt, /preserve irregular room proportions/);
  assert.match(prompt, /wall:1@0.50\/140cm/);
  assert.match(prompt, /wall:4@0.20\/90cm/);
  assert.match(prompt, /source room image as a strict reference/i);
});

function developerScenePlan(overrides = {}) {
  return {
    roomKey: 'developer-room-1',
    variantIndex: 1,
    designDirection: 'Calm catalog-first composition adapted to the shell',
    density: 'BALANCED',
    zones: [{ name: 'main', purpose: 'primary room function' }],
    requiredRoles: [],
    optionalRoles: [],
    placementRules: [],
    circulationRules: ['keep the entrance path clear'],
    selectedProductIds: [],
    roleAssignments: [],
    placementHints: [],
    nonCommercialContext: [],
    renderNarrative: {
      roomStory: 'Use the reviewed shell',
      geometryRules: [
        'RAW WALL DUMP MUST NOT REACH THE B2B RENDER PROMPT',
        'wall:3@0.33/90cm',
      ],
      cameraRule: 'old narrative camera rule',
      focalRelationships: [],
    },
    ...overrides,
  };
}

test('B2B developer prompt uses a concise deterministic source-shell contract', () => {
  const promptBuilder = new PromptBuilderService();
  const sofa = createProduct({ index: 40, category: ProductCategory.SOFA });
  const result = promptBuilder.buildDeveloperPromptWithinLimit(
    {
      ...dto,
      sourceImageUrl: 'https://example.com/deterministic-shell.png',
      spatialProfile: {
        exactDoorCount: 2,
        exactWindowCount: 0,
        geometryContract: [
          'OPENING COUNT IS HARD GEOMETRY: exactly 2 doors and no windows.',
          'Wall 4 has two doors at 20% and 79% measured from its start in polygon order.',
          'Keep the cyclic wall order exactly as reviewed. Never add, remove, mirror, swap or relocate an opening.',
        ],
        windowPositions: [],
        doorPositions: ['wall:4@0.20/90cm', 'wall:4@0.79/100cm'],
        circulationConstraints: ['keep door-to-room paths clear'],
        sizeClass: 'SMALL',
        source: 'REVIEWED_POLYGON',
      },
      scenePlan: developerScenePlan({
        selectedProductIds: [sofa.id],
        roleAssignments: [
          { role: 'PRIMARY_ANCHOR', productId: sofa.id },
        ],
      }),
    },
    [sofa],
  );

  assert.match(result.prompt, /ARCHITECTURE IS IMMUTABLE/);
  assert.match(result.prompt, /Preserve the provided room shell exactly/);
  assert.match(
    result.prompt,
    /Do not add, remove, move, resize, mirror or rotate doors\/windows\/walls/,
  );
  assert.match(result.prompt, /Furnish and style the existing architecture only/);
  assert.doesNotMatch(result.prompt, /RAW WALL DUMP/);
  assert.doesNotMatch(result.prompt, /wall:3@0\.33/);
  assert.match(result.prompt, /exactly 2 doors/i);
  assert.match(result.prompt, /exactly zero windows/i);
  assert.match(result.prompt, /Wall 4 has two doors at 20% and 79%/);
  assert.equal(
    result.prompt.match(/ARCHITECTURE IS IMMUTABLE/g)?.length,
    1,
  );
  assert.ok(result.prompt.length <= 8200);
});

test('prompt_zero_window_guard: B2B shell contract forbids creating a window when exact count is zero', () => {
  const promptBuilder = new PromptBuilderService();
  const mirror = createProduct({ index: 44, category: ProductCategory.MIRROR });
  const result = promptBuilder.buildDeveloperPromptWithinLimit(
    {
      ...dto,
      roomType: RoomType.HALLWAY,
      sourceImageUrl: 'https://example.com/hallway-shell.png',
      spatialProfile: {
        exactDoorCount: 2,
        exactWindowCount: 0,
        geometryContract: [
          'OPENING COUNT IS HARD GEOMETRY: exactly 2 doors and no windows.',
          'Wall 4 has two doors at 20% and 79% measured from its start in polygon order.',
        ],
        windowPositions: [],
        doorPositions: ['wall:4@0.20/90cm', 'wall:4@0.79/100cm'],
        circulationConstraints: ['keep door-to-room paths clear'],
        sizeClass: 'SMALL',
        source: 'REVIEWED_POLYGON',
      },
      scenePlan: developerScenePlan({
        selectedProductIds: [mirror.id],
        roleAssignments: [{ role: 'WALL_ACCENT', productId: mirror.id }],
      }),
    },
    [mirror],
  );

  assert.match(result.prompt, /exactly zero windows/i);
  assert.match(result.prompt, /do not create a window/i);
  assert.match(result.prompt, /any rendered window is a geometry error/i);
});

test('B2B bathroom prompt permits sanitary core but forbids arbitrary standalone furniture', () => {
  const promptBuilder = new PromptBuilderService();
  const mirror = createProduct({ index: 41, category: ProductCategory.MIRROR });
  const result = promptBuilder.buildDeveloperPromptWithinLimit(
    {
      ...dto,
      roomType: RoomType.BATHROOM,
      widthCm: 120,
      depthCm: 240,
      sourceImageUrl: 'https://example.com/bathroom-shell.png',
      spatialProfile: {
        exactDoorCount: 1,
        exactWindowCount: 0,
        geometryContract: [
          'OPENING COUNT IS HARD GEOMETRY: exactly 1 door and no windows.',
          'Wall 3 has one door at 54% measured from its start in polygon order.',
        ],
        windowPositions: [],
        doorPositions: ['wall:3@0.54/85cm'],
        circulationConstraints: ['keep door-to-room paths clear'],
        sizeClass: 'SMALL',
        source: 'REVIEWED_POLYGON',
      },
      scenePlan: developerScenePlan({
        selectedProductIds: [mirror.id],
        roleAssignments: [{ role: 'WALL_ACCENT', productId: mirror.id }],
        nonCommercialContext: ['BATHROOM_SANITARY_CORE'],
      }),
    },
    [mirror],
  );

  assert.match(result.prompt, /SANITARY CORE IS MANDATORY/);
  assert.match(result.prompt, /ONE-DOOR GUARD/);
  assert.match(result.prompt, /exactly one door/i);
  assert.match(result.prompt, /exactly zero windows/i);
  assert.match(result.prompt, /non-commercial context/i);
  assert.match(result.prompt, /No unselected standalone furniture/i);
  assert.match(result.prompt, /wardrobe|cabinet/i);
});

test('bedroom_no_unselected_accent_seating: B2B prompt forbids accent chair and desk when those SKUs are absent', () => {
  const promptBuilder = new PromptBuilderService();
  const bed = createProduct({ index: 42, category: ProductCategory.BED });
  const result = promptBuilder.buildDeveloperPromptWithinLimit(
    {
      ...dto,
      roomType: RoomType.BEDROOM,
      widthCm: 240,
      depthCm: 500,
      sourceImageUrl: 'https://example.com/bedroom-shell.png',
      scenePlan: developerScenePlan({
        selectedProductIds: [bed.id],
        roleAssignments: [{ role: 'PRIMARY_ANCHOR', productId: bed.id }],
      }),
    },
    [bed],
  );

  assert.match(result.prompt, /No ARMCHAIR product is selected/);
  assert.match(result.prompt, /No DESK product is selected/);
  assert.match(result.prompt, /do not add armchairs or lounge chairs/i);
  assert.match(result.prompt, /do not add desks or work tables/i);
});

test('B2B prompt keeps all nine selected SKU identities within its provider reserve', () => {
  const promptBuilder = new PromptBuilderService();
  const products = createNineLivingRoomProducts({
    descriptionRepeat: 20,
    longTitle: 20,
  });
  const result = promptBuilder.buildDeveloperPromptWithinLimit(
    {
      ...dto,
      sourceImageUrl: 'https://example.com/living-shell.png',
      scenePlan: developerScenePlan({
        selectedProductIds: products.map(({ id }) => id),
        roleAssignments: products.map((product, index) => ({
          role: index === 0 ? 'PRIMARY_ANCHOR' : 'DECOR',
          productId: product.id,
        })),
      }),
    },
    products,
  );

  assert.equal(result.includedProductsCount, 9);
  assert.equal(result.totalProductsCount, 9);
  assert.ok(result.prompt.length <= 8200, `actual length: ${result.prompt.length}`);
  for (const [index, product] of products.entries()) {
    assert.match(result.prompt, new RegExp(`P${index + 1}:`));
    assert.match(result.prompt, new RegExp(product.id));
  }
});

test('b2c_unchanged: source-room prompt does not opt into the B2B deterministic shell contract', () => {
  const promptBuilder = new PromptBuilderService();
  const prompt = promptBuilder.buildPrompt(
    {
      ...dto,
      sourceImageUrl: 'https://example.com/customer-room.jpg',
    },
    [createProduct({ index: 43, category: ProductCategory.SOFA })],
  );

  assert.doesNotMatch(prompt, /ARCHITECTURE IS IMMUTABLE/);
  assert.doesNotMatch(prompt, /Furnish and style the existing architecture only/);
  assert.match(prompt, /source room image as a strict reference/i);
});
