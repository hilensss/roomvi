import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  B2BProjectType,
  B2BProjectStatus,
  GenerationScenario,
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@roomvi/database';
import { Readable } from 'node:stream';

const { B2BProjectsService } = await import(
  '../dist/modules/b2b-projects/b2b-projects.service.js'
);
const { B2BProjectsController } = await import(
  '../dist/modules/b2b-projects/b2b-projects.controller.js'
);

function product(id, overrides = {}) {
  return {
    id,
    supplierId: 'supplier-1',
    externalId: `external-${id}`,
    title: `Product ${id}`,
    description: null,
    category: ProductCategory.SOFA,
    roomTypes: [RoomType.LIVING_ROOM],
    styleTags: [InteriorStyle.SCANDI],
    price: 25_000,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: StockStatus.IN_STOCK,
    imageUrls: [`https://example.com/${id}.jpg`],
    productUrl: `https://example.com/${id}`,
    widthCm: 200,
    heightCm: 80,
    depthCm: 90,
    material: 'fabric',
    color: 'gray',
    isActive: true,
    isAiEligible: true,
    ...overrides,
  };
}

function projectRecord(overrides = {}) {
  return {
    id: 'b2b-project-1',
    type: B2BProjectType.FURNITURE_LINE,
    name: 'Новая линейка',
    partnerName: 'Мебельный дом',
    supplierId: 'supplier-1',
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.SCANDI,
    managerComment: null,
    sourceImageUrl: null,
    status: B2BProjectStatus.DRAFT,
    roomProjectId: null,
    products: [],
    ...overrides,
  };
}

test('furniture catalog rejects developer projects without a supplier', async () => {
  const service = new B2BProjectsService(
    {
      b2BProject: {
        findUnique: async () =>
          projectRecord({
            type: B2BProjectType.DEVELOPER_FLOOR_PLAN,
            supplierId: null,
            roomType: null,
          }),
      },
    },
    { enqueueGeneration: async () => undefined },
  );

  await assert.rejects(
    service.getCatalog('b2b-project-1', {
      limit: 24,
      offset: 0,
    }),
    (error) => error instanceof BadRequestException,
  );
});

test('create persists an optional empty-room sourceImageUrl', async () => {
  let createArgs;
  const service = new B2BProjectsService(
    {
      supplier: { findFirst: async () => ({ id: 'supplier-1' }) },
      b2BProject: {
        create: async (args) => {
          createArgs = args;
          return projectRecord({
            sourceImageUrl: args.data.sourceImageUrl,
          });
        },
      },
    },
    { enqueueGeneration: async () => undefined },
  );

  await service.create(
    {
      name: 'Новая линейка',
      partnerName: 'Мебельный дом',
      supplierId: 'supplier-1',
      roomType: RoomType.LIVING_ROOM,
      style: InteriorStyle.SCANDI,
      sourceImageUrl: 'https://cdn.example.com/empty-room.jpg',
    },
    'manager-1',
  );

  assert.equal(
    createArgs.data.sourceImageUrl,
    'https://cdn.example.com/empty-room.jpg',
  );
});

test('replaceProducts rejects products that are unavailable or outside the project supplier', async () => {
  const tx = {
    b2BProject: {
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => projectRecord(),
    },
    product: {
      findMany: async () => [product('product-1')],
    },
    b2BProjectProduct: {
      deleteMany: async () => assert.fail('invalid selection must not be saved'),
    },
  };
  const prisma = {
    $transaction: async (callback) => callback(tx),
  };
  const service = new B2BProjectsService(prisma, {
    enqueueGeneration: async () => undefined,
  });

  await assert.rejects(
    service.replaceProducts('b2b-project-1', [
      'product-1',
      'missing-product',
    ]),
    (error) => error instanceof BadRequestException,
  );
});

test('replaceProducts accepts ten products when the project has no room photo', async () => {
  const selected = Array.from({ length: 10 }, (_, index) =>
    product(`product-${index + 1}`),
  );
  let savedProducts;
  const tx = {
    product: { findMany: async () => selected },
    b2BProjectProduct: {
      deleteMany: async () => undefined,
      createMany: async ({ data }) => {
        savedProducts = data;
      },
    },
    b2BProject: {
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => projectRecord(),
      update: async () =>
        projectRecord({ status: B2BProjectStatus.READY_TO_GENERATE }),
    },
  };
  const service = new B2BProjectsService(
    { $transaction: async (callback) => callback(tx) },
    { enqueueGeneration: async () => undefined },
  );

  await service.replaceProducts(
    'b2b-project-1',
    selected.map(({ id }) => id),
  );

  assert.equal(savedProducts.length, 10);
});

test('replaceProducts rejects ten products when the project has a room photo', async () => {
  const selected = Array.from({ length: 10 }, (_, index) =>
    product(`product-${index + 1}`),
  );
  const tx = {
    product: {
      findMany: async () =>
        assert.fail('the photo-specific cap must be checked first'),
    },
    b2BProjectProduct: {
      deleteMany: async () =>
        assert.fail('an oversized selection must not be saved'),
    },
    b2BProject: {
      updateMany: async () => ({ count: 1 }),
      findUnique: async () =>
        projectRecord({
          sourceImageUrl: 'https://cdn.example.com/empty-room.jpg',
        }),
    },
  };
  const service = new B2BProjectsService(
    { $transaction: async (callback) => callback(tx) },
    { enqueueGeneration: async () => undefined },
  );

  await assert.rejects(
    service.replaceProducts(
      'b2b-project-1',
      selected.map(({ id }) => id),
    ),
    /Choose between 1 and 9 products/,
  );
});

test('replaceProducts snapshots the validated manual selection in its chosen order', async () => {
  const selected = [product('product-1'), product('product-2')];
  const calls = [];
  const tx = {
    product: {
      findMany: async () => [...selected].reverse(),
    },
    b2BProjectProduct: {
      deleteMany: async (args) => calls.push(['deleteMany', args]),
      createMany: async (args) => calls.push(['createMany', args]),
    },
    b2BProject: {
      updateMany: async (args) => {
        calls.push(['updateMany', args]);
        return { count: 1 };
      },
      findUnique: async () => projectRecord(),
      update: async (args) => {
        calls.push(['update', args]);
        return projectRecord({
          status: B2BProjectStatus.READY_TO_GENERATE,
        });
      },
    },
  };
  const prisma = {
    b2BProject: {
      findUnique: async () => projectRecord(),
    },
    $transaction: async (callback) => callback(tx),
  };
  const service = new B2BProjectsService(prisma, {
    enqueueGeneration: async () => undefined,
  });

  await service.replaceProducts('b2b-project-1', [
    'product-1',
    'product-2',
  ]);

  const createCall = calls.find(([name]) => name === 'createMany');
  const updateCall = calls.find(([name]) => name === 'update');
  assert.equal(createCall[1].data[0].productId, 'product-1');
  assert.equal(createCall[1].data[0].sortOrder, 0);
  assert.equal(
    createCall[1].data[0].productSnapshot.title,
    'Product product-1',
  );
  assert.equal(createCall[1].data[1].productId, 'product-2');
  assert.equal(
    updateCall[1].data.status,
    B2BProjectStatus.READY_TO_GENERATE,
  );
});

test('replaceProducts cannot overwrite a project claimed by generation', async () => {
  let selectionDeleted = false;
  const tx = {
    b2BProject: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () =>
        projectRecord({ status: B2BProjectStatus.GENERATING }),
    },
    b2BProjectProduct: {
      deleteMany: async () => {
        selectionDeleted = true;
      },
    },
  };
  const service = new B2BProjectsService(
    {
      b2BProject: { findUnique: async () => projectRecord() },
      $transaction: async (callback) => callback(tx),
    },
    { enqueueGeneration: async () => undefined },
  );

  await assert.rejects(
    service.replaceProducts('b2b-project-1', ['product-1']),
    (error) => error instanceof ConflictException,
  );
  assert.equal(selectionDeleted, false);
});

test('update cannot overwrite a project claimed by generation', async () => {
  const tx = {
    b2BProject: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () =>
        projectRecord({ status: B2BProjectStatus.GENERATING }),
    },
  };
  const service = new B2BProjectsService(
    {
      b2BProject: { findUnique: async () => projectRecord() },
      $transaction: async (callback) => callback(tx),
    },
    { enqueueGeneration: async () => undefined },
  );

  await assert.rejects(
    service.update('b2b-project-1', { name: 'Новое имя' }),
    (error) => error instanceof ConflictException,
  );
});

test('update preserves the selection when supplierId is unchanged', async () => {
  let selectionDeleted = false;
  let updateArgs;
  const readyProject = projectRecord({
    status: B2BProjectStatus.READY_TO_GENERATE,
  });
  const tx = {
    b2BProject: {
      updateMany: async (args) => {
        updateArgs = args;
        return { count: 1 };
      },
      findUnique: async () => readyProject,
    },
    b2BProjectProduct: {
      deleteMany: async () => {
        selectionDeleted = true;
      },
    },
  };
  const service = new B2BProjectsService(
    {
      b2BProject: { findUnique: async () => readyProject },
      supplier: { findFirst: async () => ({ id: 'supplier-1' }) },
      $transaction: async (callback) => callback(tx),
    },
    { enqueueGeneration: async () => undefined },
  );

  await service.update('b2b-project-1', { supplierId: 'supplier-1' });

  assert.equal(selectionDeleted, false);
  assert.equal(updateArgs.data.status, undefined);
  assert.equal(updateArgs.where.supplierId, 'supplier-1');
});

test('startGeneration revalidates the fixed set and enqueues exactly two furniture variants', async () => {
  const fixedProducts = [product('product-1'), product('product-2')];
  const project = projectRecord({
    status: B2BProjectStatus.READY_TO_GENERATE,
    sourceImageUrl: 'https://cdn.example.com/empty-room.jpg',
    products: fixedProducts.map((value, sortOrder) => ({
      productId: value.id,
      sortOrder,
      product: value,
    })),
  });
  const calls = [];
  const tx = {
    product: {
      findMany: async () => {
        calls.push(['product.findMany']);
        return fixedProducts;
      },
    },
    roomProject: {
      create: async (args) => {
        calls.push(['roomProject.create', args]);
        return { id: 'room-project-1', ...args.data };
      },
    },
    generationJob: {
      create: async (args) => {
        calls.push(['generationJob.create', args]);
        return { id: 'job-1', ...args.data };
      },
    },
    b2BProject: {
      updateMany: async (args) => {
        calls.push(['b2BProject.updateMany', args]);
        return { count: 1 };
      },
      findUnique: async () => {
        calls.push(['b2BProject.findUnique']);
        return project;
      },
      update: async (args) => {
        calls.push(['b2BProject.update', args]);
        return { ...project, ...args.data };
      },
    },
  };
  const queued = [];
  const prisma = {
    b2BProject: {
      findUnique: async () =>
        assert.fail('generation must read selection only after atomic claim'),
    },
    $transaction: async (callback) => callback(tx),
  };
  const service = new B2BProjectsService(prisma, {
    enqueueGeneration: async (id) => queued.push(id),
  });

  const result = await service.startGeneration('b2b-project-1', 'manager-1');
  const generationCall = calls.find(([name]) => name === 'generationJob.create');

  assert.equal(
    generationCall[1].data.scenario,
    GenerationScenario.B2B_FURNITURE_LINE,
  );
  assert.equal(generationCall[1].data.requestedVariants, 2);
  const roomProjectCall = calls.find(
    ([name]) => name === 'roomProject.create',
  );
  assert.equal(
    roomProjectCall[1].data.sourceImageUrl,
    'https://cdn.example.com/empty-room.jpg',
  );
  assert.deepEqual(generationCall[1].data.inputParams.productIds, [
    'product-1',
    'product-2',
  ]);
  assert.deepEqual(queued, ['job-1']);
  assert.equal(result.job.id, 'job-1');
  assert.ok(
    calls.findIndex(([name]) => name === 'b2BProject.updateMany') <
      calls.findIndex(([name]) => name === 'b2BProject.findUnique'),
  );
});

test('startGeneration atomically rejects a concurrent second launch', async () => {
  const fixedProduct = product('product-1');
  const project = projectRecord({
    status: B2BProjectStatus.READY_TO_GENERATE,
    products: [
      { productId: fixedProduct.id, sortOrder: 0, product: fixedProduct },
    ],
  });
  const tx = {
    b2BProject: {
      updateMany: async () => ({ count: 0 }),
      findUnique: async () =>
        projectRecord({ status: B2BProjectStatus.GENERATING }),
    },
    roomProject: {
      create: async () => assert.fail('room project must not be created'),
    },
  };
  const service = new B2BProjectsService(
    {
      $transaction: async (callback) => callback(tx),
    },
    { enqueueGeneration: async () => assert.fail('job must not be enqueued') },
  );

  await assert.rejects(
    service.startGeneration('b2b-project-1', 'manager-1'),
    (error) => error instanceof ConflictException,
  );
});

test('startGeneration retries a failed project with the saved selection', async () => {
  const fixedProduct = product('product-1');
  const project = projectRecord({
    status: B2BProjectStatus.FAILED,
    roomProjectId: 'room-project-existing',
    sourceImageUrl: 'https://cdn.example.com/updated-empty-room.jpg',
    products: [
      { productId: fixedProduct.id, sortOrder: 0, product: fixedProduct },
    ],
  });
  let roomProjectUpdate;
  const tx = {
    product: { findMany: async () => [fixedProduct] },
    b2BProject: {
      updateMany: async (args) => {
        assert.deepEqual(args.where.status.in, [
          B2BProjectStatus.READY_TO_GENERATE,
          B2BProjectStatus.FAILED,
        ]);
        return { count: 1 };
      },
      findUnique: async () => project,
      update: async () => project,
    },
    roomProject: {
      update: async (args) => {
        roomProjectUpdate = args;
        return { id: 'room-project-existing', ...args.data };
      },
    },
    generationJob: {
      create: async ({ data }) => ({ id: 'job-retry', ...data }),
    },
  };
  const queued = [];
  const service = new B2BProjectsService(
    {
      $transaction: async (callback) => callback(tx),
    },
    { enqueueGeneration: async (id) => queued.push(id) },
  );

  const result = await service.startGeneration('b2b-project-1', 'manager-1');

  assert.equal(result.job.id, 'job-retry');
  assert.deepEqual(queued, ['job-retry']);
  assert.equal(
    roomProjectUpdate.data.sourceImageUrl,
    'https://cdn.example.com/updated-empty-room.jpg',
  );
});

test('downloadVariant proxies only a variant belonging to the B2B project', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorageBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  let variantQuery;
  let fetchOptions;
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com';
  globalThis.fetch = async (_url, options) => {
    fetchOptions = options;
    return new Response(Uint8Array.from([1, 2, 3]), {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': '3',
      },
    });
  };

  try {
    const service = new B2BProjectsService(
      {
        designVariant: {
          findFirst: async (query) => {
            variantQuery = query;
            return {
              id: 'variant-1',
              imageUrl: 'https://cdn.example.com/variant-1.jpg',
            };
          },
        },
      },
      { enqueueGeneration: async () => undefined },
    );

    const result = await service.downloadVariant(
      'b2b-project-1',
      'variant-1',
    );

    assert.deepEqual(variantQuery.where, {
      id: 'variant-1',
      roomProject: { b2bProject: { id: 'b2b-project-1' } },
    });
    assert.equal(result.contentType, 'image/jpeg');
    assert.equal(result.fileName, 'roomvi-variant-1.jpg');
    assert.equal(result.contentLength, 3);
    assert.equal(fetchOptions.redirect, 'error');
    assert.ok(fetchOptions.signal instanceof AbortSignal);
    const bytes = [];
    for await (const chunk of result.stream) bytes.push(...chunk);
    assert.deepEqual(bytes, [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorageBaseUrl === undefined) {
      delete process.env.S3_PUBLIC_BASE_URL;
    } else {
      process.env.S3_PUBLIC_BASE_URL = originalStorageBaseUrl;
    }
  }
});

test('downloadVariant hides variants outside the B2B project', async () => {
  const service = new B2BProjectsService(
    {
      designVariant: { findFirst: async () => null },
    },
    { enqueueGeneration: async () => undefined },
  );

  await assert.rejects(
    service.downloadVariant('b2b-project-1', 'variant-other'),
    (error) => error instanceof NotFoundException,
  );
});

test('downloadVariant rejects image URLs outside configured origins', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorageBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  let fetchCalled = false;
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com';
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('should not be fetched');
  };

  try {
    const service = new B2BProjectsService(
      {
        designVariant: {
          findFirst: async () => ({
            id: 'variant-1',
            imageUrl: 'http://127.0.0.1/private',
          }),
        },
      },
      { enqueueGeneration: async () => undefined },
    );

    await assert.rejects(
      service.downloadVariant('b2b-project-1', 'variant-1'),
      (error) => error instanceof BadGatewayException,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorageBaseUrl === undefined) {
      delete process.env.S3_PUBLIC_BASE_URL;
    } else {
      process.env.S3_PUBLIC_BASE_URL = originalStorageBaseUrl;
    }
  }
});

test('downloadVariant rejects a declared image larger than the proxy limit', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorageBaseUrl = process.env.S3_PUBLIC_BASE_URL;
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com';
  globalThis.fetch = async () =>
    new Response(Uint8Array.from([1]), {
      headers: {
        'content-type': 'image/png',
        'content-length': String(21 * 1024 * 1024),
      },
    });

  try {
    const service = new B2BProjectsService(
      {
        designVariant: {
          findFirst: async () => ({
            id: 'variant-1',
            imageUrl: 'https://cdn.example.com/variant-1.png',
          }),
        },
      },
      { enqueueGeneration: async () => undefined },
    );

    await assert.rejects(
      service.downloadVariant('b2b-project-1', 'variant-1'),
      (error) => error instanceof BadGatewayException,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorageBaseUrl === undefined) {
      delete process.env.S3_PUBLIC_BASE_URL;
    } else {
      process.env.S3_PUBLIC_BASE_URL = originalStorageBaseUrl;
    }
  }
});

test('download endpoint forces an attachment response', async () => {
  const controller = new B2BProjectsController({
    downloadVariant: async () => ({
      stream: Readable.from([Buffer.from([1, 2, 3])]),
      contentType: 'image/png',
      fileName: 'roomvi-variant-1.png',
      contentLength: 3,
    }),
  });

  const file = await controller.downloadVariant('project-1', 'variant-1');
  const headers = file.getHeaders();

  assert.equal(headers.type, 'image/png');
  assert.equal(
    headers.disposition,
    'attachment; filename="roomvi-variant-1.png"',
  );
  assert.equal(headers.length, 3);
  const bytes = [];
  for await (const chunk of file.getStream()) bytes.push(...chunk);
  assert.deepEqual(bytes, [1, 2, 3]);
});
