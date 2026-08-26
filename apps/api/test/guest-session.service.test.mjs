import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { GuestService } from '../dist/modules/guest/guest.service.js';

function guestSession(overrides = {}) {
  return {
    id: 'guest-session-1',
    anonymousId: 'guest-cookie-1',
    ipHash: null,
    userAgentHash: null,
    previewGenerationsUsed: 0,
    previewGenerationsLimit: 1,
    firstSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date(Date.now() + 60_000),
    convertedUserId: null,
    convertedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('guest preview usage is claimed atomically against the persisted limit', async () => {
  const initial = guestSession();
  const updated = guestSession({ previewGenerationsUsed: 1 });
  let findCount = 0;
  let claim;
  const prisma = {
    guestSession: {
      findUnique: async () => (findCount++ === 0 ? initial : updated),
      updateMany: async (args) => {
        claim = args;
        return { count: 1 };
      },
    },
  };

  const result = await new GuestService(prisma, {}).incrementPreviewGenerationUsage(
    initial.anonymousId,
  );

  assert.equal(result.previewGenerationsUsed, 1);
  assert.deepEqual(claim.where.previewGenerationsUsed, { lt: 1 });
  assert.equal(claim.where.convertedUserId, null);
  assert.deepEqual(claim.data.previewGenerationsUsed, { increment: 1 });
});

test('a parallel guest preview loser receives the current limit state', async () => {
  const initial = guestSession();
  const limited = guestSession({ previewGenerationsUsed: 1 });
  let findCount = 0;
  const prisma = {
    guestSession: {
      findUnique: async () => (findCount++ === 0 ? initial : limited),
      updateMany: async () => ({ count: 0 }),
    },
  };

  await assert.rejects(
    new GuestService(prisma, {}).incrementPreviewGenerationUsage(
      initial.anonymousId,
    ),
    (error) => {
      assert.equal(error instanceof HttpException, true);
      assert.equal(error.getStatus(), 429);
      assert.deepEqual(error.getResponse(), {
        code: 'GUEST_GENERATION_LIMIT_EXCEEDED',
        message: 'Guest preview generation limit exceeded',
        previewGenerationsUsed: 1,
        previewGenerationsLimit: 1,
      });
      return true;
    },
  );
});

test('guest conversion merges duplicate products into the existing user cart', async () => {
  const session = guestSession();
  const cartUpdates = [];
  const cartItemUpserts = [];
  const cartItemDeletes = [];
  let ownerTransfer;
  const tx = {
    guestSession: { updateMany: async () => ({ count: 1 }) },
    cart: {
      findMany: async () => [
        {
          id: 'guest-cart',
          items: [
            {
              id: 'guest-item',
              productId: 'product-1',
              supplierId: 'supplier-1',
              source: 'CATALOG',
              roomProjectId: null,
              designVariantId: null,
              quantity: 2,
              priceSnapshot: 100,
              titleSnapshot: 'Product',
              imageSnapshot: null,
              availabilitySnapshot: 'IN_STOCK',
            },
          ],
        },
      ],
      findFirst: async () => ({ id: 'user-cart' }),
      update: async (args) => {
        cartUpdates.push(args);
        return args.data;
      },
      updateMany: async (args) => {
        ownerTransfer = args;
        return { count: 1 };
      },
    },
    cartItem: {
      upsert: async (args) => {
        cartItemUpserts.push(args);
        return args.update;
      },
      delete: async (args) => {
        cartItemDeletes.push(args);
        return args.where;
      },
      findMany: async () => [
        {
          priceSnapshot: 100,
          quantity: 3,
          product: { isActive: true, stockStatus: 'IN_STOCK' },
        },
      ],
    },
    roomProject: { updateMany: async () => ({ count: 0 }) },
    generationJob: { updateMany: async () => ({ count: 0 }) },
    file: { updateMany: async () => ({ count: 0 }) },
  };
  const prisma = {
    guestSession: { findUnique: async () => session },
    $transaction: async (operation) => operation(tx),
  };

  await new GuestService(prisma, {}).attachGuestSessionToUser(
    session.anonymousId,
    'user-1',
  );

  assert.deepEqual(cartItemUpserts, [
    {
      where: {
        cartId_productId: {
          cartId: 'user-cart',
          productId: 'product-1',
        },
      },
      update: { quantity: { increment: 2 } },
      create: {
        cartId: 'user-cart',
        productId: 'product-1',
        supplierId: 'supplier-1',
        source: 'CATALOG',
        roomProjectId: null,
        designVariantId: null,
        quantity: 2,
        priceSnapshot: 100,
        titleSnapshot: 'Product',
        imageSnapshot: null,
        availabilitySnapshot: 'IN_STOCK',
      },
    },
  ]);
  assert.deepEqual(cartItemDeletes, [{ where: { id: 'guest-item' } }]);
  assert.deepEqual(cartUpdates, [
    {
      where: { id: 'guest-cart' },
      data: { status: 'ABANDONED', totalAmount: 0 },
    },
    {
      where: { id: 'user-cart' },
      data: { totalAmount: 300 },
    },
  ]);
  assert.deepEqual(ownerTransfer, {
    where: { guestSessionId: session.id },
    data: { userId: 'user-1', guestSessionId: null },
  });
});
