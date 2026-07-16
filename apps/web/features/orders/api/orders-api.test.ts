import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/shared/api/api-client', () => ({ apiFetch }));

import {
  cancelOrder,
  createOrder,
  getOrder,
  listOrders,
} from './orders-api';

describe('orders api', () => {
  beforeEach(() => apiFetch.mockReset());

  it('creates an order with the idempotency header', async () => {
    const input = {
      customerName: 'Анна',
      customerEmail: 'anna@example.com',
      customerPhone: '+79991234567',
      deliveryCity: 'Москва',
      deliveryAddress: 'Тверская, 10',
    };

    await createOrder(input, 'checkout-key');

    expect(apiFetch).toHaveBeenCalledWith('/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'checkout-key' },
      body: JSON.stringify(input),
    });
  });

  it('uses pagination and owner-scoped detail/cancel endpoints', async () => {
    await listOrders({ limit: 20, offset: 40 });
    await getOrder('order-1');
    await cancelOrder('order-1');

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/orders?limit=20&offset=40');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/orders/order-1');
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/orders/order-1/cancel', {
      method: 'POST',
    });
  });
});
