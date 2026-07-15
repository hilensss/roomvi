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
  const tx = {
    cart: {
      findFirst: async () => cart(),
      findUnique: async () => cart(),
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
    $transaction: async (callback) => callback(tx),
  };

  const service = new OrdersService(prisma);
  const result = await service.createOrderFromCart(
    'cart-1',
    dto,
    context,
    ' checkout-key ',
  );

  assert.equal(createData.idempotencyKey, 'checkout-key');
  assert.equal(createData.subtotalAmount, 700);
  assert.equal(createData.totalAmount, 700);
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
  const tx = {
    order: {
      findFirst: async () =>
        orderRecord({
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          fulfillmentStatus: 'NOT_STARTED',
        }),
      update: async (args) => {
        calls.push(['order.update', args]);
        return orderRecord({
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          cancelledAt: args.data.cancelledAt,
        });
      },
    },
    payment: {
      updateMany: async (args) => {
        calls.push(['payment.updateMany', args]);
      },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const service = new OrdersService(prisma);

  const result = await service.cancelOrder('order-1', context);

  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.paymentStatus, 'CANCELLED');
  assert.ok(result.cancelledAt instanceof Date);
  assert.deepEqual(calls[0][1].where, {
    orderId: 'order-1',
    status: 'PENDING',
  });
  assert.deepEqual(calls[0][1].data, { status: 'CANCELLED' });
  assert.equal(calls[1][1].data.status, 'CANCELLED');
  assert.equal(calls[1][1].data.paymentStatus, 'CANCELLED');
});

test('cancellation rejects disallowed order, payment, and fulfillment states', async () => {
  for (const state of [
    { status: 'PROCESSING', paymentStatus: 'PENDING', fulfillmentStatus: 'NOT_STARTED' },
    { status: 'CONFIRMED', paymentStatus: 'PAID', fulfillmentStatus: 'NOT_STARTED' },
    { status: 'CONFIRMED', paymentStatus: 'PENDING', fulfillmentStatus: 'PROCUREMENT' },
  ]) {
    const tx = {
      order: {
        findFirst: async () => orderRecord(state),
        update: async () => assert.fail('order was cancelled'),
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
