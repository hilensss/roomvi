import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@roomvi/database';

const { YesAiNanoBananaProvider } = await import(
  '../dist/modules/generation-processing/providers/yes-ai-nano-banana.provider.js'
);

test('provider prompt stays within YES AI limit after optional instructions', () => {
  const provider = new YesAiNanoBananaProvider(null, null);
  const essentialMarker = 'PRESERVE_CONFIRMED_ROOM_GEOMETRY';
  const input = {
    prompt: `${essentialMarker}\n${'room catalog instruction '.repeat(365)}`,
    negativePrompt: 'unlisted furniture, distorted geometry, extra doors, '.repeat(
      20,
    ),
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MINIMALISM,
    products: [],
    variantsCount: 1,
    sourceImageUrl: 'https://example.com/shell.png',
    customerId: 'job-1',
  };

  const prompt = provider.buildProviderPrompt(input, 1);

  assert.ok(prompt.length <= 10_000, `actual length: ${prompt.length}`);
  assert.match(prompt, new RegExp(essentialMarker));
  assert.match(prompt, /preserve camera, walls, windows, doors/i);
});

test('prompt compaction does not reduce prepared product references', async () => {
  const cachedProductIds = [];
  const provider = new YesAiNanoBananaProvider(null, {
    getOrCreateReference: async ({ productId, sourceUrl }) => {
      cachedProductIds.push(productId);
      return sourceUrl;
    },
  });
  const products = Array.from({ length: 6 }, (_, index) => ({
    id: `product-${index + 1}`,
    supplierId: 'supplier-1',
    externalId: `external-${index + 1}`,
    title: `Product ${index + 1}`,
    description: 'long description '.repeat(100),
    category: index === 0 ? ProductCategory.SOFA : ProductCategory.DECOR,
    price: 10_000,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: [`https://example.com/product-${index + 1}.jpg`],
    productUrl: null,
    widthCm: 100,
    heightCm: 100,
    depthCm: 100,
    material: null,
    color: null,
    styleTags: [InteriorStyle.MINIMALISM],
    roomTypes: [RoomType.LIVING_ROOM],
    isActive: true,
    isAiEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }));

  const references = await provider.prepareReferences({
    prompt: 'compact prompt',
    negativePrompt: 'negative prompt',
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.MINIMALISM,
    products,
    variantsCount: 1,
    customerId: 'job-1',
  });

  assert.equal(references.urls.length, 6);
  assert.deepEqual(cachedProductIds.sort(), products.map(({ id }) => id).sort());
});

function product(index) {
  return {
    id: `b2b-product-${index}`,
    supplierId: 'supplier-1',
    externalId: `b2b-external-${index}`,
    title: `B2B selected SKU ${index}`,
    description: null,
    category: index === 1 ? ProductCategory.SOFA : ProductCategory.DECOR,
    price: 10_000 + index,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: [`https://example.com/b2b-${index}.jpg`],
    productUrl: null,
    widthCm: 100,
    heightCm: 100,
    depthCm: 100,
    material: null,
    color: null,
    styleTags: [InteriorStyle.SCANDI],
    roomTypes: [RoomType.LIVING_ROOM],
    isActive: true,
    isAiEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

test('B2B shell is REF_1 and full nine-product provider prompt remains within 10000 chars', async () => {
  const provider = new YesAiNanoBananaProvider(null, {
    getOrCreateReference: async ({ sourceUrl }) => sourceUrl,
  });
  const products = Array.from({ length: 9 }, (_, index) => product(index + 1));
  const input = {
    prompt: [
      'SOURCE SHELL CONTRACT: Preserve the provided room shell exactly.',
      ...products.map(
        (item, index) =>
          `P${index + 1}:${item.id};${item.category};${item.title};once;strict`,
      ),
      'compact composition guidance '.repeat(180),
    ].join('\n'),
    negativePrompt: 'extra furniture, moved opening',
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.SCANDI,
    products,
    variantsCount: 1,
    sourceImageUrl: 'https://cdn.example.com/b2b-room-shell/v1/hash.png',
    sourceShell: true,
    b2bRoomId: 'room-16-living',
    customerId: 'job-16-living',
  };

  const references = await provider.prepareReferences(input);
  const prompt = provider.buildProviderPrompt(input, 1, references.contractLines);

  assert.equal(references.urls[0], input.sourceImageUrl);
  assert.match(references.contractLines[0], /^REF_1=SOURCE_SHELL/);
  assert.equal(references.urls.length, 10);
  assert.ok(prompt.length <= 10_000, `actual length: ${prompt.length}`);
  assert.match(prompt, /REF_1=SOURCE_SHELL/);
  assert.equal(
    prompt.match(/SOURCE_SHELL is strict/g)?.length ?? 0,
    0,
    'provider must not append a second geometry contract after the B2B prompt',
  );
  for (const [index, item] of products.entries()) {
    assert.match(prompt, new RegExp(`P${index + 1}:${item.id}`));
  }
});

test('YES AI create retries a transient fetch failure once and logs safe cause details', { concurrency: false }, async () => {
  const provider = new YesAiNanoBananaProvider(null, null);
  const originalFetch = globalThis.fetch;
  const originalDelay = process.env.YESAI_TRANSPORT_RETRY_BASE_DELAY_MS;
  const warnings = [];
  let attempts = 0;
  process.env.YESAI_TRANSPORT_RETRY_BASE_DELAY_MS = '0';
  provider.logger = {
    log: () => undefined,
    debug: () => undefined,
    warn: (message) => warnings.push(message),
    error: () => undefined,
  };
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new TypeError('fetch failed');
      error.cause = { code: 'ECONNRESET' };
      throw error;
    }
    return new Response(
      JSON.stringify({
        success: true,
        message: 'ok',
        results: { generation_data: { id: 123, status: 0 } },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const result = await provider.createGeneration({
      config: {
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com',
        version: 'v.2',
        style: '7',
        dimensions: '16:9',
        resolution: '1k',
        initialPollDelayMs: 0,
        pollIntervalMs: 1,
        timeoutMs: 100,
      },
      input: {
        prompt: 'valid prompt',
        roomType: RoomType.LIVING_ROOM,
        style: InteriorStyle.SCANDI,
        products: [],
        variantsCount: 1,
        customerId: 'job-1',
      },
      variantNumber: 1,
    });

    assert.equal(result.generation.id, 123);
    assert.equal(attempts, 2);
    assert.ok(
      warnings.some(
        (message) =>
          message.includes('causeName=TypeError') &&
          message.includes('causeCode=ECONNRESET') &&
          message.includes('causeMessage=fetch failed'),
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDelay === undefined) {
      delete process.env.YESAI_TRANSPORT_RETRY_BASE_DELAY_MS;
    } else {
      process.env.YESAI_TRANSPORT_RETRY_BASE_DELAY_MS = originalDelay;
    }
  }
});

test('YES AI create does not retry a deterministic 401 response', { concurrency: false }, async () => {
  const provider = new YesAiNanoBananaProvider(null, null);
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(
      JSON.stringify({ success: false, message: 'UNAUTHORIZED' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    await assert.rejects(
      provider.createGeneration({
        config: {
          apiKey: 'test-key',
          baseUrl: 'https://api.example.com',
          version: 'v.2',
          style: '7',
          dimensions: '16:9',
          resolution: '1k',
          initialPollDelayMs: 0,
          pollIntervalMs: 1,
          timeoutMs: 100,
        },
        input: {
          prompt: 'valid prompt',
          roomType: RoomType.LIVING_ROOM,
          style: InteriorStyle.SCANDI,
          products: [],
          variantsCount: 1,
          customerId: 'job-1',
        },
        variantNumber: 1,
      }),
      /UNAUTHORIZED/,
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
