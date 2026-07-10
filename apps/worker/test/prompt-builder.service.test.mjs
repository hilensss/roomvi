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

const finalQualityLine =
  'Do not place product labels, text annotations, arrows, prices, brand labels or measurement text in the image.';
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

test('small prompt returns full mode and preserves buildPrompt output exactly', () => {
  const promptBuilder = new PromptBuilderService();
  const products = [
    createProduct({ index: 1, category: ProductCategory.SOFA }),
    createProduct({ index: 2, category: ProductCategory.COFFEE_TABLE }),
  ];

  const fullPrompt = promptBuilder.buildPrompt(dto, products);
  const result = promptBuilder.buildPromptWithinLimit(dto, products, 9500);

  assert.equal(result.mode, 'full');
  assert.equal(result.prompt, fullPrompt);
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
  assert.match(result.prompt, /Use ONLY the selected catalog products/);
  assert.match(result.prompt, /Do not invent additional sofas/);
  assert.match(result.prompt, /Reference product images may be attached/);
  assert.match(result.prompt, /The sofa is the hero object/);
  assert.match(result.prompt, /The selected SOFA is the main object/);
  assert.match(result.prompt, /No BED product is selected/);
  assert.match(result.prompt, /FINAL QUALITY TARGET:/);
  assert.match(result.prompt, /SOFA compact title 1/);
  assert.equal(result.prompt.endsWith(finalQualityLine), true);
  assert.equal(result.prompt.includes(longDescriptionTail), false);
});

test('compact mode omits secondary product metadata while keeping all compact fields', () => {
  const promptBuilder = new PromptBuilderService();
  const products = createNineLivingRoomProducts();
  const result = promptBuilder.buildPromptWithinLimit(dto, products, 9500);

  assert.equal(result.mode, 'compact');
  assert.match(result.prompt, /CATEGORY=SOFA/);
  assert.match(result.prompt, /TITLE=SOFA compact title 1/);
  assert.match(result.prompt, /COLOR=warm gray/);
  assert.match(result.prompt, /MATERIAL=oak veneer and textured fabric/);
  assert.match(result.prompt, /SIZE=101x61x81 cm/);
  assert.match(result.prompt, /DESCRIPTION=Product 1 premium/);
  assert.match(result.prompt, /VISUAL_RULE=Use as listed SOFA role/);
  assert.match(
    result.prompt,
    /Preserve category, approximate silhouette, color, material and scale/,
  );
  assert.equal(result.prompt.includes('ID=product-1'), false);
  assert.equal(result.prompt.includes('PRICE='), false);
  assert.equal(result.prompt.includes('CATALOG_STYLES='), false);
  assert.equal(result.prompt.includes('CATALOG_ROOMS='), false);
});

test('smaller limit keeps hero product and final rules when not all products fit', () => {
  const promptBuilder = new PromptBuilderService();
  const products = createNineLivingRoomProducts({
    descriptionRepeat: 12,
    longTitle: 30,
  });
  const result = promptBuilder.buildPromptWithinLimit(dto, products, 6200);

  assert.equal(result.mode, 'compact');
  assert.ok(result.prompt.length <= 6200);
  assert.ok(result.includedProductsCount < result.totalProductsCount);
  assert.match(result.prompt, /CATEGORY=SOFA/);
  assert.match(result.prompt, /TITLE=SOFA compact title 1/);
  assert.match(result.prompt, /Use ONLY the selected catalog products/);
  assert.match(result.prompt, /No BED product is selected/);
  assert.equal(result.prompt.endsWith(finalQualityLine), true);
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
