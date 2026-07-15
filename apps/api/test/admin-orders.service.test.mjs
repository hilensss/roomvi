import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

const { AdminService } = await import(
  '../dist/modules/admin/admin.service.js'
);

const now = new Date('2026-07-15T12:00:00.000Z');

function orderRecord(overrides = {}) {
  return {
    id: 'order-1',
    number: 42,
    cartId: 'cart-1',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'NOT_STARTED',
    subtotalAmount: 700,
    deliveryAmount: 0,
    totalAmount: 700,
    currency: 'RUB',
    customerName: 'Ada Lovelace',
    customerEmail: 'ada@example.com',
    customerPhone: '+995555123456',
    deliveryCity: 'Tbilisi',
    deliveryAddress: '1 Rustaveli Avenue',
    deliveryPostalCode: '0108',
    deliveryComment: 'Call on arrival',
    deliveryDate: null,
    customerComment: 'Careful',
    managerComment: 'Manager note',
    paidAt: null,
    cancelledAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    user: {
      id: 'user-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      phone: '+995555123456',
    },
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        supplierId: 'supplier-1',
        externalProductId: 'external-1',
        source: 'CATALOG',
        roomProjectId: null,
        designVariantId: null,
        quantity: 2,
        priceSnapshot: 350,
        totalPrice: 700,
        titleSnapshot: 'Chair',
        imageSnapshot: 'chair.jpg',
        availabilitySnapshot: 'IN_STOCK',
        supplierNameSnapshot: 'Supplier One',
        productUrlSnapshot: 'https://supplier.test/chair',
        procurementStatus: 'NOT_STARTED',
        managerComment: 'Item note',
        createdAt: now,
        updatedAt: now,
      },
    ],
    supplierOrders: [{ id: 'supplier-order-1', status: 'MANUAL_PROCESSING' }],
    cart: { id: 'cart-1', status: 'CONVERTED', items: [] },
    payments: [
      {
        id: 'payment-1',
        provider: 'MANUAL',
        status: 'PENDING',
        amount: 700,
        currency: 'RUB',
        externalPaymentId: null,
        paymentUrl: null,
        failureCode: 'DECLINED',
        failureMessage: 'Declined',
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  };
}

test('findOrders combines every independent filter with legacy search and maps latest payment singularly', async () => {
  let findManyArgs;
  let countArgs;
  const service = new AdminService({
    order: {
      findMany: async (args) => {
        findManyArgs = args;
        return [orderRecord()];
      },
      count: async (args) => {
        countArgs = args;
        return 1;
      },
    },
  });

  const query = {
    limit: 10,
    offset: 5,
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'NOT_STARTED',
    number: 42,
    customerEmail: 'ada@example',
    customerPhone: '555',
    createdFrom: '2026-07-01T00:00:00.000Z',
    createdTo: '2026-07-31T23:59:59.999Z',
    search: 'Ada',
  };
  const result = await service.findOrders(query);

  assert.deepEqual(findManyArgs.where, {
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'NOT_STARTED',
    number: 42,
    customerEmail: { contains: 'ada@example', mode: 'insensitive' },
    customerPhone: { contains: '555', mode: 'insensitive' },
    createdAt: {
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-31T23:59:59.999Z'),
    },
    OR: [
      { customerName: { contains: 'Ada', mode: 'insensitive' } },
      { customerPhone: { contains: 'Ada', mode: 'insensitive' } },
      { customerEmail: { contains: 'Ada', mode: 'insensitive' } },
    ],
  });
  assert.deepEqual(countArgs.where, findManyArgs.where);
  assert.equal(findManyArgs.take, 10);
  assert.equal(findManyArgs.skip, 5);
  assert.deepEqual(findManyArgs.orderBy, { createdAt: 'desc' });
  assert.equal(findManyArgs.select.items.take, 5);
  assert.equal(findManyArgs.select.payments.take, 1);
  assert.deepEqual(findManyArgs.select.payments.orderBy, { createdAt: 'desc' });
  assert.equal(result.items[0].payment.id, 'payment-1');
  assert.equal('payments' in result.items[0], false);
});

test('findOrders rejects an inverted creation range before querying Prisma', async () => {
  const service = new AdminService({
    order: {
      findMany: async () => assert.fail('query should not execute'),
      count: async () => assert.fail('count should not execute'),
    },
  });

  await assert.rejects(
    service.findOrders({
      limit: 20,
      offset: 0,
      createdFrom: '2026-08-01T00:00:00.000Z',
      createdTo: '2026-07-01T00:00:00.000Z',
    }),
    (error) => error instanceof BadRequestException,
  );
});

test('getOrderById explicitly selects admin snapshots and maps payment failure fields without payments array', async () => {
  let args;
  const service = new AdminService({
    order: {
      findUnique: async (input) => {
        args = input;
        return orderRecord();
      },
    },
  });

  const result = await service.getOrderById('order-1');

  assert.equal(args.select.managerComment, true);
  assert.equal(args.select.items.select.supplierNameSnapshot, true);
  assert.equal(args.select.items.select.externalProductId, true);
  assert.equal(args.select.items.select.productUrlSnapshot, true);
  assert.equal(args.select.items.select.procurementStatus, true);
  assert.equal(args.select.items.select.managerComment, true);
  assert.equal(args.select.payments.select.failureCode, true);
  assert.equal(args.select.payments.select.failureMessage, true);
  assert.equal(args.select.payments.take, 1);
  assert.equal(result.managerComment, 'Manager note');
  assert.equal(result.items[0].supplierNameSnapshot, 'Supplier One');
  assert.equal(result.payment.failureCode, 'DECLINED');
  assert.equal('payments' in result, false);
});

function transactionPrisma(tx, beforeCallback) {
  const options = [];
  return {
    options,
    prisma: {
      $transaction: async (callback, transactionOptions) => {
        options.push(transactionOptions);
        if (beforeCallback) await beforeCallback(options.length);
        return callback(tx);
      },
    },
  };
}

function statusTransaction(state, updateCount = 1) {
  let detail = orderRecord(state);
  const calls = [];
  const tx = {
    order: {
      findUnique: async (args) => {
        if (args.select?.items) return detail;
        return {
          id: detail.id,
          status: detail.status,
          paymentStatus: detail.paymentStatus,
          fulfillmentStatus: detail.fulfillmentStatus,
          completedAt: detail.completedAt,
          cancelledAt: detail.cancelledAt,
        };
      },
      updateMany: async (args) => {
        calls.push(['order.updateMany', args]);
        if (updateCount === 1) detail = { ...detail, ...args.data };
        return { count: updateCount };
      },
    },
    payment: {
      updateMany: async (args) => {
        calls.push(['payment.updateMany', args]);
        return { count: 1 };
      },
    },
  };
  return { tx, calls };
}

test('status update retries P2034, uses exact CAS, and sets completedAt once', async () => {
  const { tx, calls } = statusTransaction({ status: 'PROCESSING' });
  const { prisma, options } = transactionPrisma(tx, async (attempt) => {
    if (attempt === 1) {
      throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
    }
  });
  const service = new AdminService(prisma);

  const result = await service.updateOrderStatus('order-1', {
    status: 'COMPLETED',
  });

  assert.equal(result.status, 'COMPLETED');
  assert.ok(result.completedAt instanceof Date);
  assert.equal(options.length, 2);
  assert.deepEqual(options, [
    { isolationLevel: 'Serializable' },
    { isolationLevel: 'Serializable' },
  ]);
  assert.deepEqual(calls[0][1].where, {
    id: 'order-1',
    status: 'PROCESSING',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'NOT_STARTED',
  });
  assert.equal(calls[0][1].data.status, 'COMPLETED');
  assert.ok(calls[0][1].data.completedAt instanceof Date);
});

test('status transaction retries only P2034 and stops after three attempts', async (t) => {
  await t.test('does not retry another Prisma error', async () => {
    let attempts = 0;
    const service = new AdminService({
      $transaction: async () => {
        attempts += 1;
        throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
      },
    });
    await assert.rejects(
      service.updateOrderStatus('order-1', { status: 'PROCESSING' }),
      (error) => error.code === 'P2002',
    );
    assert.equal(attempts, 1);
  });

  await t.test('stops after the third serialization conflict', async () => {
    let attempts = 0;
    const service = new AdminService({
      $transaction: async () => {
        attempts += 1;
        throw Object.assign(new Error('serialization conflict'), {
          code: 'P2034',
        });
      },
    });
    await assert.rejects(
      service.updateOrderStatus('order-1', { status: 'PROCESSING' }),
      (error) => error.code === 'P2034',
    );
    assert.equal(attempts, 3);
  });
});

test('status update rejects invalid transitions and concurrent CAS changes while same status is idempotent', async (t) => {
  await t.test('invalid transition', async () => {
    const { tx, calls } = statusTransaction({ status: 'CONFIRMED' });
    const service = new AdminService(transactionPrisma(tx).prisma);
    await assert.rejects(
      service.updateOrderStatus('order-1', { status: 'COMPLETED' }),
      (error) => error instanceof ConflictException,
    );
    assert.equal(calls.length, 0);
  });

  await t.test('same status', async () => {
    const { tx, calls } = statusTransaction({
      status: 'COMPLETED',
      completedAt: now,
    });
    const service = new AdminService(transactionPrisma(tx).prisma);
    const result = await service.updateOrderStatus('order-1', {
      status: 'COMPLETED',
    });
    assert.equal(result.completedAt, now);
    assert.equal(calls.length, 0);
  });

  await t.test('CAS conflict', async () => {
    const { tx, calls } = statusTransaction({ status: 'CONFIRMED' }, 0);
    const service = new AdminService(transactionPrisma(tx).prisma);
    await assert.rejects(
      service.updateOrderStatus('order-1', { status: 'PROCESSING' }),
      (error) => error instanceof ConflictException,
    );
    assert.equal(calls.length, 1);
  });
});

test('cancellation enforces payment and fulfillment invariants and cancels only pending payment state', async (t) => {
  for (const paymentStatus of ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED']) {
    await t.test(`rejects ${paymentStatus}`, async () => {
      const { tx, calls } = statusTransaction({ paymentStatus });
      const service = new AdminService(transactionPrisma(tx).prisma);
      await assert.rejects(
        service.updateOrderStatus('order-1', { status: 'CANCELLED' }),
        (error) => error instanceof ConflictException,
      );
      assert.equal(calls.length, 0);
    });
  }

  await t.test('rejects started fulfillment', async () => {
    const { tx } = statusTransaction({ fulfillmentStatus: 'PROCUREMENT' });
    const service = new AdminService(transactionPrisma(tx).prisma);
    await assert.rejects(
      service.updateOrderStatus('order-1', { status: 'CANCELLED' }),
      (error) => error instanceof ConflictException,
    );
  });

  await t.test('cancels pending order and payment rows', async () => {
    const { tx, calls } = statusTransaction({ paymentStatus: 'PENDING' });
    const service = new AdminService(transactionPrisma(tx).prisma);
    const result = await service.updateOrderStatus('order-1', {
      status: 'CANCELLED',
    });
    assert.equal(result.paymentStatus, 'CANCELLED');
    assert.ok(result.cancelledAt instanceof Date);
    assert.equal(calls[0][1].data.paymentStatus, 'CANCELLED');
    assert.deepEqual(calls[1][1], {
      where: { orderId: 'order-1', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  });
});

function procurementTransaction({
  item = { id: 'item-1', procurementStatus: 'NOT_STARTED' },
  updateCount = 1,
  statuses = ['ORDERED', 'NOT_STARTED'],
} = {}) {
  const calls = [];
  const tx = {
    orderItem: {
      findFirst: async (args) => {
        calls.push(['orderItem.findFirst', args]);
        return item;
      },
      updateMany: async (args) => {
        calls.push(['orderItem.updateMany', args]);
        return { count: updateCount };
      },
      findMany: async (args) => {
        calls.push(['orderItem.findMany', args]);
        return statuses.map((procurementStatus) => ({ procurementStatus }));
      },
    },
    order: {
      update: async (args) => {
        calls.push(['order.update', args]);
      },
      findUnique: async () =>
        orderRecord({
          fulfillmentStatus: statuses.includes('NOT_STARTED')
            ? 'PROCUREMENT'
            : 'PROCURED',
        }),
    },
  };
  return { tx, calls };
}

test('procurement update is owner-scoped, compare-and-set, and derives parent fulfillment in the same transaction', async () => {
  const { tx, calls } = procurementTransaction();
  const { prisma, options } = transactionPrisma(tx);
  const service = new AdminService(prisma);

  const result = await service.updateOrderItemProcurementStatus(
    'order-1',
    'item-1',
    { procurementStatus: 'ORDERED' },
  );

  assert.deepEqual(options, [{ isolationLevel: 'Serializable' }]);
  assert.deepEqual(calls[0][1], {
    where: { id: 'item-1', orderId: 'order-1' },
    select: { id: true, procurementStatus: true },
  });
  assert.deepEqual(calls[1][1], {
    where: {
      id: 'item-1',
      orderId: 'order-1',
      procurementStatus: 'NOT_STARTED',
    },
    data: { procurementStatus: 'ORDERED' },
  });
  assert.deepEqual(calls[2][1], {
    where: { orderId: 'order-1' },
    select: { procurementStatus: true },
  });
  assert.deepEqual(calls[3][1], {
    where: { id: 'order-1' },
    data: { fulfillmentStatus: 'PROCUREMENT' },
  });
  assert.equal(result.id, 'order-1');
});

test('procurement update handles ownership, transition, idempotency, and CAS conflicts', async (t) => {
  await t.test('missing or foreign item', async () => {
    const { tx } = procurementTransaction({ item: null });
    const service = new AdminService(transactionPrisma(tx).prisma);
    await assert.rejects(
      service.updateOrderItemProcurementStatus('order-1', 'foreign-item', {
        procurementStatus: 'ORDERED',
      }),
      (error) => error instanceof NotFoundException,
    );
  });

  await t.test('invalid transition', async () => {
    const { tx, calls } = procurementTransaction();
    const service = new AdminService(transactionPrisma(tx).prisma);
    await assert.rejects(
      service.updateOrderItemProcurementStatus('order-1', 'item-1', {
        procurementStatus: 'DELIVERED',
      }),
      (error) => error instanceof ConflictException,
    );
    assert.equal(calls.filter(([name]) => name === 'orderItem.updateMany').length, 0);
  });

  await t.test('same status skips item mutation', async () => {
    const { tx, calls } = procurementTransaction({
      item: { id: 'item-1', procurementStatus: 'ORDERED' },
      statuses: ['ORDERED'],
    });
    const service = new AdminService(transactionPrisma(tx).prisma);
    await service.updateOrderItemProcurementStatus('order-1', 'item-1', {
      procurementStatus: 'ORDERED',
    });
    assert.equal(calls.filter(([name]) => name === 'orderItem.updateMany').length, 0);
  });

  await t.test('CAS conflict', async () => {
    const { tx } = procurementTransaction({ updateCount: 0 });
    const service = new AdminService(transactionPrisma(tx).prisma);
    await assert.rejects(
      service.updateOrderItemProcurementStatus('order-1', 'item-1', {
        procurementStatus: 'ORDERED',
      }),
      (error) => error instanceof ConflictException,
    );
  });
});

test('manager comments are owner-scoped, nullable, return detail, and report missing targets as 404', async () => {
  const calls = [];
  const prisma = {
    order: {
      updateMany: async (args) => {
        calls.push(['order.updateMany', args]);
        return { count: args.where.id === 'missing-order' ? 0 : 1 };
      },
      findUnique: async () => orderRecord({ managerComment: null }),
    },
    orderItem: {
      updateMany: async (args) => {
        calls.push(['orderItem.updateMany', args]);
        return { count: args.where.id === 'missing-item' ? 0 : 1 };
      },
    },
  };
  const service = new AdminService(prisma);

  const order = await service.updateOrderManagerComment('order-1', {
    managerComment: null,
  });
  assert.equal(order.managerComment, null);
  assert.deepEqual(calls[0][1], {
    where: { id: 'order-1' },
    data: { managerComment: null },
  });

  await assert.rejects(
    service.updateOrderManagerComment('missing-order', {
      managerComment: null,
    }),
    (error) => error instanceof NotFoundException,
  );

  await service.updateOrderItemManagerComment('order-1', 'item-1', {
    managerComment: 'Call supplier',
  });
  assert.deepEqual(calls[2][1], {
    where: { id: 'item-1', orderId: 'order-1' },
    data: { managerComment: 'Call supplier' },
  });

  await assert.rejects(
    service.updateOrderItemManagerComment('order-1', 'missing-item', {
      managerComment: null,
    }),
    (error) => error instanceof NotFoundException,
  );
});
