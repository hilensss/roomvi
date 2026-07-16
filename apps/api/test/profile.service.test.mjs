import assert from 'node:assert/strict';
import test from 'node:test';
import { ProfileService } from '../dist/modules/profile/profile.service.js';

test('profile summary selects only safe order scalars', async () => {
  let orderQuery;
  const safeOrder = {
    id: 'order-1',
    number: 1042,
    status: 'PENDING_PAYMENT',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'NOT_STARTED',
    totalAmount: 12000,
    currency: 'RUB',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const prisma = {
    user: {
      findUniqueOrThrow: async () => ({
        id: 'user-1',
        email: 'user@example.com',
      }),
    },
    roomProject: { findMany: async () => [] },
    order: {
      findMany: async (query) => {
        orderQuery = query;
        return [safeOrder];
      },
    },
    $transaction: (operations) => Promise.all(operations),
  };

  const result = await new ProfileService(prisma).getSummary('user-1');

  assert.deepEqual(orderQuery, {
    where: { userId: 'user-1' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      totalAmount: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  assert.deepEqual(result.orders, [safeOrder]);
});
