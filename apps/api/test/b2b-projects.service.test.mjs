import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  B2BProjectStatus,
  GenerationScenario,
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@roomvi/database';

const { B2BProjectsService } = await import(
  '../dist/modules/b2b-projects/b2b-projects.service.js'
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
    name: 'Новая линейка',
    partnerName: 'Мебельный дом',
    supplierId: 'supplier-1',
    roomType: RoomType.LIVING_ROOM,
    style: InteriorStyle.SCANDI,
    managerComment: null,
    status: B2BProjectStatus.DRAFT,
    roomProjectId: null,
    products: [],
    ...overrides,
  };
}

test('replaceProducts rejects products that are unavailable or outside the project supplier', async () => {
  const prisma = {
    b2BProject: {
      findUnique: async () => projectRecord(),
    },
    product: {
      findMany: async () => [product('product-1')],
    },
    $transaction: async () => assert.fail('transaction should not start'),
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

test('replaceProducts snapshots the validated manual selection in its chosen order', async () => {
  const selected = [product('product-1'), product('product-2')];
  const calls = [];
  const tx = {
    b2BProjectProduct: {
      deleteMany: async (args) => calls.push(['deleteMany', args]),
      createMany: async (args) => calls.push(['createMany', args]),
    },
    b2BProject: {
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
    product: {
      findMany: async () => [...selected].reverse(),
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

  assert.equal(calls[1][1].data[0].productId, 'product-1');
  assert.equal(calls[1][1].data[0].sortOrder, 0);
  assert.equal(calls[1][1].data[0].productSnapshot.title, 'Product product-1');
  assert.equal(calls[1][1].data[1].productId, 'product-2');
  assert.equal(
    calls[2][1].data.status,
    B2BProjectStatus.READY_TO_GENERATE,
  );
});

test('startGeneration revalidates the fixed set and enqueues exactly two furniture variants', async () => {
  const fixedProducts = [product('product-1'), product('product-2')];
  const project = projectRecord({
    status: B2BProjectStatus.READY_TO_GENERATE,
    products: fixedProducts.map((value, sortOrder) => ({
      productId: value.id,
      sortOrder,
      product: value,
    })),
  });
  const calls = [];
  const tx = {
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
      update: async (args) => {
        calls.push(['b2BProject.update', args]);
        return { ...project, ...args.data };
      },
    },
  };
  const queued = [];
  const prisma = {
    b2BProject: {
      findUnique: async () => project,
    },
    product: {
      findMany: async () => fixedProducts,
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
  assert.deepEqual(generationCall[1].data.inputParams.productIds, [
    'product-1',
    'product-2',
  ]);
  assert.deepEqual(queued, ['job-1']);
  assert.equal(result.job.id, 'job-1');
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
    },
    roomProject: {
      create: async () => assert.fail('room project must not be created'),
    },
  };
  const service = new B2BProjectsService(
    {
      b2BProject: { findUnique: async () => project },
      product: { findMany: async () => [fixedProduct] },
      $transaction: async (callback) => callback(tx),
    },
    { enqueueGeneration: async () => assert.fail('job must not be enqueued') },
  );

  await assert.rejects(
    service.startGeneration('b2b-project-1', 'manager-1'),
    (error) => error instanceof ConflictException,
  );
});
