import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

const { OrdersService } = await import(
  '../dist/modules/orders/orders.service.js'
);

const now = new Date('2026-07-15T12:00:00.000Z');

const dto = {
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  customerPhone: '+995555123456',
  deliveryCity: 'Tbilisi',
  deliveryAddress: '1 Rustaveli Avenue',
  deliveryPostalCode: '0108',
  deliveryComment: 'Call on arrival',
  customerComment: 'Please handle carefully',
};

const context = { user: { userId: 'user-1', role: 'USER' } };

function cart(overrides = {}) {
  return {
    id: 'cart-1',
    userId: 'user-1',
    guestSessionId: 'guest-1',
    status: 'ACTIVE',
    currency: 'RUB',
    items: [
      {
        id: 'cart-item-1',
        productId: 'product-1',
        supplierId: 'stale-supplier',
        source: 'DESIGN_PROJECT',
        roomProjectId: 'project-1',
        designVariantId: 'design-1',
        quantity: 2,
        priceSnapshot: 100,
        titleSnapshot: 'Stale title',
        imageSnapshot: 'https://stale.invalid/image.jpg',
        availabilitySnapshot: 'OUT_OF_STOCK',
        product: {
          id: 'product-1',
          supplierId: 'supplier-1',
          externalId: 'external-1',
          title: 'Server-priced chair',
          price: 350,
          currency: 'RUB',
          stockStatus: 'IN_STOCK',
          isActive: true,
          imageUrls: ['https://cdn.example.com/chair.jpg'],
          productUrl: 'https://supplier.example.com/chair',
          supplier: { id: 'supplier-1', name: 'Supplier One' },
        },
      },
    ],
    ...overrides,
  };
}

function orderRecord(overrides = {}) {
  return {
    id: 'order-1',
    number: 42,
    userId: 'user-1',
    cartId: 'cart-1',
    idempotencyKey: 'secret-key',
    status: 'PENDING_PAYMENT',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'NOT_STARTED',
    subtotalAmount: 700,
    deliveryAmount: 0,
    totalAmount: 700,
    currency: 'RUB',
    customerName: dto.customerName,
    customerEmail: dto.customerEmail,
    customerPhone: dto.customerPhone,
    deliveryCity: dto.deliveryCity,
    deliveryAddress: dto.deliveryAddress,
    deliveryPostalCode: dto.deliveryPostalCode,
    deliveryComment: dto.deliveryComment,
    customerComment: dto.customerComment,
    managerComment: 'private manager note',
    paidAt: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'order-item-1',
        productId: 'product-1',
        supplierId: 'supplier-1',
        externalProductId: 'external-1',
        source: 'DESIGN_PROJECT',
        roomProjectId: 'project-1',
        designVariantId: 'design-1',
        quantity: 2,
        priceSnapshot: 350,
        totalPrice: 700,
        titleSnapshot: 'Server-priced chair',
        imageSnapshot: 'https://cdn.example.com/chair.jpg',
        availabilitySnapshot: 'IN_STOCK',
        supplierNameSnapshot: 'Supplier One',
        productUrlSnapshot: 'https://supplier.example.com/chair',
        procurementStatus: 'NOT_STARTED',
        managerComment: 'private item note',
        createdAt: now,
        updatedAt: now,
      },
    ],
    payments: [
      {
        id: 'payment-1',
        provider: 'MANUAL',
        status: 'PENDING',
        amount: 700,
        currency: 'RUB',
        paymentUrl: null,
        paidAt: null,
        metadata: { private: true },
        failureMessage: 'private failure',
      },
    ],
    supplierOrders: [{ payload: { private: true } }],
    ...overrides,
  };
}

test('checkout uses current server product data and mutates only through the transaction delegate', async () => {
  const calls = [];
  let createData;
  let cartLookup;
  let transactionOptions;
  const tx = {
    cart: {
      findFirst: async (args) => {
        cartLookup = args;
        return cart();
      },
      update: async (args) => {
        calls.push(['cart.update', args]);
      },
    },
    cartItem: {
      deleteMany: async (args) => {
        calls.push(['cartItem.deleteMany', args]);
      },
    },
    order: {
      findFirst: async () => null,
      create: async (args) => {
        createData = args.data;
        calls.push(['order.create', args]);
        return orderRecord();
      },
    },
    roomProject: {
      updateMany: async (args) => {
        calls.push(['roomProject.updateMany', args]);
      },
    },
  };
  const prisma = {
    cart: {
      findFirst: async () => assert.fail('cart read escaped transaction'),
      findUnique: async () => assert.fail('cart read escaped transaction'),
      update: async () => assert.fail('cart mutation escaped transaction'),
    },
    cartItem: {
      deleteMany: async () => assert.fail('cart mutation escaped transaction'),
    },
    order: { findFirst: async () => null },
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback(tx);
    },
  };

  const service = new OrdersService(prisma);
  const result = await service.createOrderFromCart(
    'cart-1',
    dto,
    context,
    ' checkout-key ',
  );

  assert.deepEqual(transactionOptions, { isolationLevel: 'Serializable' });
  assert.deepEqual(cartLookup.where, {
    userId: 'user-1',
    status: 'ACTIVE',
  });
  assert.deepEqual(cartLookup.orderBy, { createdAt: 'desc' });
  assert.equal(createData.idempotencyKey, 'checkout-key');
  assert.equal(createData.subtotalAmount, 700);
  assert.equal(createData.totalAmount, 700);
  assert.equal(createData.currency, 'RUB');
  assert.deepEqual(createData.payments.create, {
    provider: 'MANUAL',
    status: 'PENDING',
    amount: 700,
    currency: 'RUB',
  });
  assert.deepEqual(
    createData.items.create.map((item) => ({
      supplierId: item.supplierId,
      externalProductId: item.externalProductId,
      priceSnapshot: item.priceSnapshot,
      totalPrice: item.totalPrice,
      titleSnapshot: item.titleSnapshot,
      imageSnapshot: item.imageSnapshot,
      availabilitySnapshot: item.availabilitySnapshot,
      supplierNameSnapshot: item.supplierNameSnapshot,
      productUrlSnapshot: item.productUrlSnapshot,
      procurementStatus: item.procurementStatus,
    })),
    [
      {
        supplierId: 'supplier-1',
        externalProductId: 'external-1',
        priceSnapshot: 350,
        totalPrice: 700,
        titleSnapshot: 'Server-priced chair',
        imageSnapshot: 'https://cdn.example.com/chair.jpg',
        availabilitySnapshot: 'IN_STOCK',
        supplierNameSnapshot: 'Supplier One',
        productUrlSnapshot: 'https://supplier.example.com/chair',
        procurementStatus: 'NOT_STARTED',
      },
    ],
  );
  assert.deepEqual(calls[1][1].where, {
    id: { in: ['cart-item-1'] },
  });
  assert.equal(calls[2][1].data.currency, 'RUB');
  assert.equal(createData.supplierOrders.create[0].payload.currency, 'RUB');
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'order.create',
      'cartItem.deleteMany',
      'cart.update',
      'roomProject.updateMany',
    ],
  );
  assert.equal(result.payment.provider, 'MANUAL');
  assert.equal(result.items[0].priceSnapshot, 350);
  assert.equal('idempotencyKey' in result, false);
  assert.equal('managerComment' in result, false);
  assert.equal('supplierNameSnapshot' in result.items[0], false);
  assert.equal('externalProductId' in result.items[0], false);
  assert.equal('productUrlSnapshot' in result.items[0], false);
  assert.equal('metadata' in result.payment, false);
  assert.equal('supplierOrders' in result, false);
});

test('normalized idempotency key returns the original order without opening a transaction', async () => {
  let lookup;
  const prisma = {
    order: {
      findFirst: async (args) => {
        lookup = args.where;
        return orderRecord();
      },
    },
    $transaction: async () => assert.fail('transaction should not start'),
  };
  const service = new OrdersService(prisma);

  const result = await service.createOrder(dto, context, ' original-key ');

  assert.deepEqual(lookup, {
    userId: 'user-1',
    idempotencyKey: 'original-key',
  });
  assert.equal(result.id, 'order-1');
  assert.equal('idempotencyKey' in result, false);
});

test('checkout rejects empty and unavailable carts before any mutation', async (t) => {
  for (const [name, selectedCart] of [
    ['empty', cart({ items: [] })],
    [
      'unavailable',
      cart({
        items: [
          {
            ...cart().items[0],
            product: { ...cart().items[0].product, stockStatus: 'OUT_OF_STOCK' },
          },
        ],
      }),
    ],
  ]) {
    await t.test(name, async () => {
      const tx = {
        cart: { findFirst: async () => selectedCart },
        order: { create: async () => assert.fail('order was created') },
        cartItem: { deleteMany: async () => assert.fail('cart was emptied') },
      };
      const prisma = {
        order: { findFirst: async () => null },
        $transaction: async (callback) => callback(tx),
      };
      const service = new OrdersService(prisma);

      await assert.rejects(
        service.createOrder(dto, context),
        (error) => error instanceof BadRequestException,
      );
    });
  }
});

test('client detail returns 404 for both missing and foreign orders', async () => {
  let where;
  const prisma = {
    order: {
      findFirst: async (args) => {
        where = args.where;
        return null;
      },
    },
  };
  const service = new OrdersService(prisma);

  await assert.rejects(
    service.getOrderById('foreign-order', context),
    (error) => error instanceof NotFoundException,
  );
  assert.deepEqual(where, { id: 'foreign-order', userId: 'user-1' });
});

test('cancellation cancels pending order and payment rows in one transaction', async () => {
  const calls = [];
  let reads = 0;
  let transactionOptions;
  const tx = {
    order: {
      findFirst: async () => {
        reads += 1;
        return orderRecord({
          status: reads === 1 ? 'CONFIRMED' : 'CANCELLED',
          paymentStatus: reads === 1 ? 'PENDING' : 'CANCELLED',
          fulfillmentStatus: 'NOT_STARTED',
          cancelledAt: reads === 1 ? null : now,
        });
      },
      updateMany: async (args) => {
        calls.push(['order.updateMany', args]);
        return { count: 1 };
      },
    },
    payment: {
      updateMany: async (args) => {
        calls.push(['payment.updateMany', args]);
      },
    },
  };
  const prisma = {
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback(tx);
    },
  };
  const service = new OrdersService(prisma);

  const result = await service.cancelOrder('order-1', context);

  assert.deepEqual(transactionOptions, { isolationLevel: 'Serializable' });
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.paymentStatus, 'CANCELLED');
  assert.deepEqual(calls[0][1].where, {
    id: 'order-1',
    userId: 'user-1',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'NOT_STARTED',
  });
  assert.equal(calls[0][1].data.status, 'CANCELLED');
  assert.equal(calls[0][1].data.paymentStatus, 'CANCELLED');
  assert.ok(calls[0][1].data.cancelledAt instanceof Date);
  assert.deepEqual(calls[1][1].where, {
    orderId: 'order-1',
    status: 'PENDING',
  });
  assert.deepEqual(calls[1][1].data, { status: 'CANCELLED' });
});

test('cancellation rejects disallowed order, payment, and fulfillment states', async () => {
  for (const state of [
    { status: 'CONFIRMED', paymentStatus: 'PAID', fulfillmentStatus: 'NOT_STARTED' },
    { status: 'CONFIRMED', paymentStatus: 'PENDING', fulfillmentStatus: 'PROCUREMENT' },
  ]) {
    const tx = {
      order: {
        findFirst: async () => orderRecord(state),
        updateMany: async () => assert.fail('order was cancelled'),
      },
      payment: { updateMany: async () => assert.fail('payment was cancelled') },
    };
    const service = new OrdersService({
      $transaction: async (callback) => callback(tx),
    });

    await assert.rejects(
      service.cancelOrder('order-1', context),
      (error) => error instanceof ConflictException,
    );
  }
});

test('client cancellation follows the shared PROCESSING to CANCELLED transition', async () => {
  let reads = 0;
  let updateArgs;
  const tx = {
    order: {
      findFirst: async () => {
        reads += 1;
        return orderRecord({
          status: reads === 1 ? 'PROCESSING' : 'CANCELLED',
          paymentStatus: reads === 1 ? 'PENDING' : 'CANCELLED',
          fulfillmentStatus: 'NOT_STARTED',
          cancelledAt: reads === 1 ? null : now,
        });
      },
      updateMany: async (args) => {
        updateArgs = args;
        return { count: 1 };
      },
    },
    payment: { updateMany: async () => ({ count: 1 }) },
  };
  const service = new OrdersService({
    $transaction: async (callback) => callback(tx),
  });

  const result = await service.cancelOrder('order-1', context);

  assert.equal(result.status, 'CANCELLED');
  assert.equal(updateArgs.where.status, 'PROCESSING');
});

test('repeated client cancellation is an idempotent no-op', async () => {
  const tx = {
    order: {
      findFirst: async () =>
        orderRecord({
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          fulfillmentStatus: 'NOT_STARTED',
          cancelledAt: now,
        }),
      updateMany: async () => assert.fail('cancelled order was rewritten'),
    },
    payment: {
      updateMany: async () => assert.fail('cancelled payment was rewritten'),
    },
  };
  const service = new OrdersService({
    $transaction: async (callback) => callback(tx),
  });

  const result = await service.cancelOrder('order-1', context);

  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.cancelledAt, now);
});

test('serializable transaction retries one P2034 conflict before succeeding', async () => {
  let attempts = 0;
  const options = [];
  let reads = 0;
  const tx = {
    order: {
      findFirst: async () => {
        reads += 1;
        return orderRecord({
          status: reads === 1 ? 'CONFIRMED' : 'CANCELLED',
          paymentStatus: reads === 1 ? 'PENDING' : 'CANCELLED',
          fulfillmentStatus: 'NOT_STARTED',
        });
      },
      updateMany: async () => ({ count: 1 }),
    },
    payment: { updateMany: async () => ({ count: 1 }) },
  };
  const service = new OrdersService({
    $transaction: async (callback, transactionOptions) => {
      attempts += 1;
      options.push(transactionOptions);
      if (attempts === 1) {
        throw Object.assign(new Error('serialization conflict'), {
          code: 'P2034',
        });
      }
      return callback(tx);
    },
  });

  const result = await service.cancelOrder('order-1', context);

  assert.equal(result.status, 'CANCELLED');
  assert.equal(attempts, 2);
  assert.deepEqual(options, [
    { isolationLevel: 'Serializable' },
    { isolationLevel: 'Serializable' },
  ]);
});

test('cancellation rejects a concurrent state change when compare-and-set updates nothing', async () => {
  let paymentMutationAttempted = false;
  const tx = {
    order: {
      findFirst: async () =>
        orderRecord({
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          fulfillmentStatus: 'NOT_STARTED',
        }),
      updateMany: async () => ({ count: 0 }),
    },
    payment: {
      updateMany: async () => {
        paymentMutationAttempted = true;
      },
    },
  };
  const service = new OrdersService({
    $transaction: async (callback) => callback(tx),
  });

  await assert.rejects(
    service.cancelOrder('order-1', context),
    (error) => error instanceof ConflictException,
  );
  assert.equal(paymentMutationAttempted, false);
});

test('checkout alias must match the newest current active cart', async () => {
  let lookup;
  const tx = {
    cart: {
      findFirst: async (args) => {
        lookup = args;
        return cart({ id: 'current-cart' });
      },
    },
    order: { create: async () => assert.fail('order was created') },
    cartItem: { deleteMany: async () => assert.fail('cart was emptied') },
  };
  const service = new OrdersService({
    order: { findFirst: async () => null },
    $transaction: async (callback) => callback(tx),
  });

  await assert.rejects(
    service.createOrderFromCart('older-cart', dto, context),
    (error) => error instanceof NotFoundException,
  );
  assert.deepEqual(lookup?.where, { userId: 'user-1', status: 'ACTIVE' });
  assert.deepEqual(lookup?.orderBy, { createdAt: 'desc' });
});

test('checkout rejects non-RUB cart and product currencies', async (t) => {
  const usdCart = cart({
    currency: 'USD',
    items: [
      {
        ...cart().items[0],
        product: { ...cart().items[0].product, currency: 'USD' },
      },
    ],
  });

  for (const [name, selectedCart] of [
    ['cart currency', usdCart],
    [
      'product currency',
      cart({
        items: [
          {
            ...cart().items[0],
            product: { ...cart().items[0].product, currency: 'USD' },
          },
        ],
      }),
    ],
  ]) {
    await t.test(name, async () => {
      const tx = {
        cart: { findFirst: async () => selectedCart },
        order: { create: async () => assert.fail('order was created') },
      };
      const service = new OrdersService({
        order: { findFirst: async () => null },
        $transaction: async (callback) => callback(tx),
      });

      await assert.rejects(
        service.createOrder(dto, context),
        (error) => error instanceof BadRequestException,
      );
    });
  }
});

test('checkout rejects a per-item PostgreSQL Int overflow', async () => {
  const selectedCart = cart({
    items: [
      {
        ...cart().items[0],
        quantity: 2,
        product: {
          ...cart().items[0].product,
          price: 2_147_483_647,
        },
      },
    ],
  });
  const tx = {
    cart: { findFirst: async () => selectedCart },
    order: { create: async () => assert.fail('order was created') },
  };
  const service = new OrdersService({
    order: { findFirst: async () => null },
    $transaction: async (callback) => callback(tx),
  });

  await assert.rejects(
    service.createOrder(dto, context),
    (error) => error instanceof BadRequestException,
  );
});

test('P2002 idempotency race recovers the original order', async () => {
  let lookups = 0;
  const service = new OrdersService({
    order: {
      findFirst: async () => {
        lookups += 1;
        return lookups === 1 ? null : orderRecord();
      },
    },
    $transaction: async () => {
      throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
    },
  });

  const result = await service.createOrder(dto, context, 'race-key');

  assert.equal(result.id, 'order-1');
  assert.equal(lookups, 2);
  assert.equal('idempotencyKey' in result, false);
});

test('paginated list returns summaries and redacts private fields', async () => {
  let findManyArgs;
  const listedOrder = orderRecord({
    _count: { items: 4 },
    items: [orderRecord().items[0]],
  });
  const service = new OrdersService({
    order: {
      findMany: async (args) => {
        findManyArgs = args;
        return [listedOrder];
      },
      count: async () => 7,
    },
  });

  const result = await service.listMyOrders(
    { limit: 2, offset: 3 },
    context,
  );

  assert.deepEqual(findManyArgs.where, { userId: 'user-1' });
  assert.deepEqual(findManyArgs.orderBy, { createdAt: 'desc' });
  assert.equal(findManyArgs.take, 2);
  assert.equal(findManyArgs.skip, 3);
  assert.equal(result.total, 7);
  assert.equal(result.limit, 2);
  assert.equal(result.offset, 3);
  assert.equal(result.items[0].itemCount, 4);
  assert.equal(result.items[0].payment.provider, 'MANUAL');
  assert.equal('idempotencyKey' in result.items[0], false);
  assert.equal('managerComment' in result.items[0], false);
  assert.equal('supplierNameSnapshot' in result.items[0].items[0], false);
  assert.equal('metadata' in result.items[0].payment, false);
});
